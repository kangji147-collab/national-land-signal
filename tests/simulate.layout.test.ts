// 시뮬레이션 이미지가 "민원인이 직접 배치한 시설물"을 따르는지 — 요청 글 만들기(lib/simulate-prompt.ts)와 /api/simulate
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayoutItem } from "../lib/layout";
import { buildSimulatePrompt, describeLayoutPlan, describePosition } from "../lib/simulate-prompt";
import { loadSeedRules } from "./helpers/load-seed-rules";

const ITEMS: LayoutItem[] = [
  { theme: "공영주차장", name: "주차 1면", icon: "🚗", areaM2: 25, units: 1, unitLabel: "면", sortOrder: 1, descriptionEn: "one painted parking bay" },
  { theme: "공영주차장", name: "관리 부스", icon: "🏠", areaM2: 9, units: 0, unitLabel: "", sortOrder: 2, descriptionEn: "a small attendant booth" },
  { theme: "공영주차장", name: "설명없는 시설", icon: "?", areaM2: 5, units: 0, unitLabel: "", sortOrder: 3 },
];

describe("describePosition", () => {
  it("가로는 left/center/right, 세로는 원근으로", () => {
    expect(describePosition(0.1, 0.2)).toBe("left background (upper part of the frame, far from the camera)");
    expect(describePosition(0.5, 0.5)).toBe("center midground");
    expect(describePosition(0.9, 0.9)).toBe("right foreground (lower part of the frame, close to the camera)");
  });
});

describe("describeLayoutPlan", () => {
  it("같은 시설물을 모아 개수와 위치 목록으로 쓴다 (표의 순서대로)", () => {
    const t = describeLayoutPlan(
      [{ name: "관리 부스", x: 0.8, y: 0.3 }, { name: "주차 1면", x: 0.2, y: 0.8 }, { name: "주차 1면", x: 0.5, y: 0.5 }],
      ITEMS,
    );
    expect(t).toBe(
      [
        "- exactly 2 × one painted parking bay: at left foreground (lower part of the frame, close to the camera); center midground",
        "- exactly 1 × a small attendant booth: at right background (upper part of the frame, far from the camera)",
      ].join("\n"),
    );
  });
  it("영어 설명이 없으면 한글 이름을 그대로 쓴다, 표에 없는 이름은 무시, 비면 null", () => {
    expect(describeLayoutPlan([{ name: "설명없는 시설", x: 0.5, y: 0.5 }], ITEMS)).toContain("exactly 1 × 설명없는 시설");
    expect(describeLayoutPlan([{ name: "없는 시설", x: 0.5, y: 0.5 }], ITEMS)).toBeNull();
    expect(describeLayoutPlan([], ITEMS)).toBeNull();
  });
});

describe("buildSimulatePrompt — 배치 반영", () => {
  it("배치가 있으면 '이 개수·이 위치대로만 그려라'와 배치도 안내, 글자 금지가 들어간다", () => {
    const p = buildSimulatePrompt("공영주차장", "land", { plan: [{ name: "주차 1면", x: 0.2, y: 0.8 }], items: ITEMS, guideImage: true })!;
    expect(p).toContain("exactly 1 × one painted parking bay");
    expect(p).toContain("Draw ONLY these facilities");
    expect(p).toContain("second image");
    expect(p).toContain("Never draw the markers");
    expect(p).toContain("Do not add any people");
  });
  it("배치도 그림이 없으면 두 번째 그림 안내는 빠진다", () => {
    const p = buildSimulatePrompt("공영주차장", "land", { plan: [{ name: "주차 1면", x: 0.2, y: 0.8 }], items: ITEMS, guideImage: false })!;
    expect(p).toContain("Draw ONLY these facilities");
    expect(p).not.toContain("second image");
  });
  it("건물이면 '건물 주변 외부 시설만'으로 지시하고 토지 문장은 쓰지 않는다", () => {
    const p = buildSimulatePrompt("공유오피스", "building", { plan: [{ name: "주차 1면", x: 0.2, y: 0.8 }], items: ITEMS, guideImage: true })!;
    expect(p).toContain("exterior facilities around the building");
    expect(p).not.toContain("Keep the rest of the land");
  });
  it("배치가 없으면 기존 요청 글과 같다", () => {
    expect(buildSimulatePrompt("공영주차장", "land", { plan: [], items: ITEMS, guideImage: false })).toBe(buildSimulatePrompt("공영주차장", "land"));
  });
});

vi.mock("@/lib/supabase", () => ({ createAnonClient: vi.fn(() => ({})) }));
vi.mock("@/lib/rules-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/rules-source")>()),
  fetchRules: vi.fn(),
  fetchAllowedThemes: vi.fn(),
  fetchLayoutItems: vi.fn(),
}));
vi.mock("@/lib/openai", () => ({ simulateImage: vi.fn() }));
vi.mock("@/lib/usage-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/usage-limit")>()),
  createSupabaseUsageStore: vi.fn(() => ({})),
  getClientIp: vi.fn(() => "1.2.3.4"),
  runWithUsage: vi.fn(),
  getUsageSummary: vi.fn(),
}));
import { POST } from "@/app/api/simulate/route";
import { simulateImage } from "@/lib/openai";
import { fetchAllowedThemes, fetchLayoutItems, fetchRules } from "@/lib/rules-source";
import { getUsageSummary, runWithUsage } from "@/lib/usage-limit";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const META = { type: "land", landCategory: "대", zone: "제2종일반주거지역", otherZones: [], answers: { onbid: "yes", dispute: "no", inUse: "no" }, theme: "공영주차장" };
const call = (meta: unknown, guide: Uint8Array | null = null) => {
  const fd = new FormData();
  fd.append("photo", new Blob([JPEG as BlobPart], { type: "image/jpeg" }), "p.jpg");
  fd.append("meta", JSON.stringify(meta));
  if (guide) fd.append("layout", new Blob([guide as BlobPart], { type: "image/jpeg" }), "layout.jpg");
  return POST(new Request("http://localhost/api/simulate", { method: "POST", body: fd }));
};

describe("POST /api/simulate — 배치", () => {
  beforeEach(() => {
    vi.mocked(fetchRules).mockReset().mockResolvedValue(loadSeedRules());
    vi.mocked(fetchAllowedThemes).mockReset().mockResolvedValue(["공영주차장"] as never);
    vi.mocked(fetchLayoutItems).mockReset().mockResolvedValue(ITEMS);
    vi.mocked(simulateImage).mockReset().mockResolvedValue({ base64: "QUJD", mime: "image/jpeg" });
    vi.mocked(runWithUsage).mockReset().mockImplementation(async (_s, _k, _ip, task) => ({ ok: true, value: await (task as () => Promise<unknown>)() }) as never);
    vi.mocked(getUsageSummary).mockReset().mockResolvedValue({ simulate: { limit: 5, used: 1, remaining: 4 } } as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("배치 개수·위치가 요청 글에 들어가고, 배치도 그림이 두 번째 그림으로 함께 간다", async () => {
    const res = await call({ ...META, layoutPlan: [{ name: "주차 1면", x: 0.2, y: 0.8 }, { name: "주차 1면", x: 0.6, y: 0.8 }] }, JPEG);
    expect(res.status).toBe(200);
    const [, prompt, , guide] = vi.mocked(simulateImage).mock.calls[0];
    expect(prompt).toContain("exactly 2 × one painted parking bay");
    expect(prompt).toContain("second image");
    expect(guide?.bytes.length).toBe(JPEG.length);
  });
  it("배치하지 않았으면 기존처럼 두 번째 그림 없이 만든다", async () => {
    await call(META);
    const [, prompt, , guide] = vi.mocked(simulateImage).mock.calls[0];
    expect(prompt).not.toContain("Draw ONLY");
    expect(guide).toBeUndefined();
    expect(fetchLayoutItems).not.toHaveBeenCalled();
  });
  it("표에 없는 시설물 이름은 400이고 횟수를 쓰지 않는다", async () => {
    const res = await call({ ...META, layoutPlan: [{ name: "없는 시설", x: 0.5, y: 0.5 }] });
    expect(res.status).toBe(400);
    expect(runWithUsage).not.toHaveBeenCalled();
    expect(simulateImage).not.toHaveBeenCalled();
  });
  it("위치가 범위 밖이면 400", async () => {
    expect((await call({ ...META, layoutPlan: [{ name: "주차 1면", x: 1.5, y: 0.5 }] })).status).toBe(400);
  });
  it("건물 진단도 배치를 받고, 요청 글에 '건물 주변 외부 시설'로 들어간다", async () => {
    vi.mocked(fetchAllowedThemes).mockResolvedValue(["공유오피스"] as never);
    vi.mocked(fetchLayoutItems).mockResolvedValue([{ theme: "공유오피스", name: "자전거 거치대", icon: "🚲", areaM2: 6, units: 0, unitLabel: "", sortOrder: 1, descriptionEn: "a bicycle rack" }]);
    const res = await call({ ...META, type: "building", theme: "공유오피스", answers: { ...META.answers, safety: "no" }, layoutPlan: [{ name: "자전거 거치대", x: 0.2, y: 0.8 }] });
    expect(res.status).toBe(200);
    const prompt = vi.mocked(simulateImage).mock.calls[0][1];
    expect(prompt).toContain("exterior facilities around the building");
    expect(prompt).toContain("exactly 1 × a bicycle rack");
  });
  it("건물 테마인데 표에 없는 시설물 이름이면 400", async () => {
    vi.mocked(fetchAllowedThemes).mockResolvedValue(["공유오피스"] as never);
    vi.mocked(fetchLayoutItems).mockResolvedValue([]);
    const res = await call({ ...META, type: "building", theme: "공유오피스", answers: { ...META.answers, safety: "no" }, layoutPlan: [{ name: "주차 1면", x: 0.5, y: 0.5 }] });
    expect(res.status).toBe(400);
  });
  it("배치도 그림이 이미지 파일이 아니면 400", async () => {
    const res = await call({ ...META, layoutPlan: [{ name: "주차 1면", x: 0.5, y: 0.5 }] }, new Uint8Array([1, 2, 3, 4]));
    expect(res.status).toBe(400);
  });
});
