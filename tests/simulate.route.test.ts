// /api/simulate 시험: 표 읽기·횟수·이미지 만들기만 가짜로 바꿔 끼우고, 실제 판정 규칙과 예시 규칙표(seed.sql)로 확인한다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSeedRules } from "./helpers/load-seed-rules";

vi.mock("@/lib/supabase", () => ({ createAnonClient: vi.fn(() => ({})) }));
vi.mock("@/lib/rules-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/rules-source")>()),
  fetchRules: vi.fn(),
  fetchAllowedThemes: vi.fn(),
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
import { RulesSourceError, fetchAllowedThemes, fetchRules } from "@/lib/rules-source";
import { getUsageSummary, runWithUsage } from "@/lib/usage-limit";

const image = vi.mocked(simulateImage);
const run = vi.mocked(runWithUsage);
const summary = vi.mocked(getUsageSummary);
const themes = vi.mocked(fetchAllowedThemes);

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const META = {
  type: "land",
  landCategory: "대",
  zone: "제2종일반주거지역",
  otherZones: [],
  answers: { onbid: "yes", dispute: "no", inUse: "no" },
  theme: "소공원",
};
const call = (over: { photo?: Uint8Array | null; meta?: unknown; metaText?: string } = {}) => {
  const fd = new FormData();
  const photo = over.photo === undefined ? JPEG : over.photo;
  if (photo) fd.append("photo", new Blob([photo as BlobPart], { type: "image/jpeg" }), "p.jpg");
  fd.append("meta", over.metaText ?? JSON.stringify(over.meta ?? META));
  return POST(new Request("http://localhost/api/simulate", { method: "POST", body: fd }));
};

beforeEach(() => {
  vi.mocked(fetchRules).mockReset().mockResolvedValue(loadSeedRules());
  themes.mockReset().mockResolvedValue(["소공원", "공영주차장"] as never);
  image.mockReset().mockResolvedValue({ base64: "QUJD", mime: "image/jpeg" });
  // 실제 runWithUsage 처럼: 작업을 실행하고, 작업이 던지면 같은 예외를 다시 던진다
  run.mockReset().mockImplementation(async (_s, _k, _ip, task) => ({ ok: true, value: await (task as () => Promise<unknown>)() }) as never);
  summary.mockReset().mockResolvedValue({ simulate: { limit: 5, used: 1, remaining: 4 } } as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/simulate", () => {
  it("🟢 + 허용 테마: 이미지와 남은 횟수를 돌려준다 (사진·테마별 요청 글을 보낸다)", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ image: "data:image/jpeg;base64,QUJD", remaining: 4 });
    const [photo, prompt] = image.mock.calls[0];
    expect(photo.mime).toBe("image/jpeg");
    expect(photo.bytes.length).toBe(JPEG.length);
    expect(prompt).toContain("park"); // 소공원 설명
    // 주소·면적 같은 값은 요청 글에 들어가지 않는다
    expect(prompt).not.toMatch(/제2종|대지|onbid/);
    // 횟수는 시뮬레이션 종류로 잡는다
    expect(run.mock.calls[0][1]).toBe("simulate");
  });

  it("png 사진도 받는다 (파일 앞부분으로 형식 확인)", async () => {
    await call({ photo: PNG });
    expect(image.mock.calls[0][0].mime).toBe("image/png");
  });

  it("🟢가 아니면 횟수를 쓰기 전에 거절한다", async () => {
    const res = await call({ meta: { ...META, answers: { onbid: "unknown", dispute: "no", inUse: "no" } } });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("NOT_GREEN");
    expect(run).not.toHaveBeenCalled();
    expect(image).not.toHaveBeenCalled();
  });

  it("허용되지 않은 테마·모르는 테마는 횟수를 쓰기 전에 거절한다", async () => {
    let res = await call({ meta: { ...META, theme: "태양광" } });
    expect((await res.json()).error.code).toBe("THEME_NOT_ALLOWED");
    res = await call({ meta: { ...META, theme: "놀이공원" } });
    expect(res.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it("사진이 없거나 형식이 틀리거나 너무 크면 거절한다 (횟수 미사용)", async () => {
    expect((await call({ photo: null })).status).toBe(400);
    let res = await call({ photo: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) }); // 이름만 jpg
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_FILE");
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big.set(JPEG);
    res = await call({ photo: big });
    expect((await res.json()).error.code).toBe("INVALID_FILE");
    expect(run).not.toHaveBeenCalled();
  });

  it("meta 가 JSON 이 아니거나 모양이 틀리면 400", async () => {
    expect((await call({ metaText: "not json" })).status).toBe(400);
    expect((await call({ meta: { type: "x" } })).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it("하루 횟수를 모두 썼으면 429 와 PRD 문구, 이미지를 만들지 않는다", async () => {
    run.mockResolvedValue({ ok: false, code: "LIMIT_EXCEEDED", message: "오늘 시뮬레이션 횟수를 모두 썼어요(5/5). 내일 0시에 다시 이용할 수 있어요" } as never);
    const res = await call();
    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toContain("5/5");
    expect(image).not.toHaveBeenCalled();
  });

  it("이미지 만들기가 실패하면 502 AI_FAILED, 내용(키)은 노출하지 않는다", async () => {
    image.mockRejectedValue(new Error("sk-secret 401"));
    const res = await call();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("AI_FAILED");
    expect(JSON.stringify(body)).not.toContain("sk-secret");
  });

  it("횟수를 잡지 못한 DB 오류는 AI_FAILED 가 아니라 일반 오류(500)", async () => {
    run.mockRejectedValue(new Error("db down"));
    const res = await call();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("SERVER_ERROR");
  });

  it("남은 횟수를 확인하지 못해도 이미지는 돌려준다", async () => {
    summary.mockRejectedValue(new Error("x"));
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).data.remaining).toBeNull();
  });

  it("규칙표 읽기 실패는 500 (횟수 미사용)", async () => {
    vi.mocked(fetchRules).mockRejectedValue(new RulesSourceError("비밀"));
    expect((await call()).status).toBe(500);
    expect(run).not.toHaveBeenCalled();
  });
});
