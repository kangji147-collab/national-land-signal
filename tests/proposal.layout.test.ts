// /api/proposal 시험 — 배치 시뮬레이터에서 놓은 시설물을 서버가 다시 확인하고 계산에 쓰는지
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSeedPrices } from "./helpers/load-seed-prices";
import { loadSeedRules } from "./helpers/load-seed-rules";

vi.mock("@/lib/supabase", () => ({ createAnonClient: vi.fn(() => ({})) }));
vi.mock("@/lib/rules-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/rules-source")>()),
  fetchRules: vi.fn(),
  fetchAllowedThemes: vi.fn(),
  fetchPrices: vi.fn(),
  fetchEffectSentences: vi.fn(),
  fetchLayoutItems: vi.fn(),
}));
vi.mock("@/lib/openai", () => ({ polishText: vi.fn() }));
vi.mock("@/lib/polish-cache", () => ({ withPolishCache: (fn: unknown) => fn }));
vi.mock("@/lib/usage-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/usage-limit")>()),
  createSupabaseUsageStore: vi.fn(() => ({})),
  getUsageSummary: vi.fn(),
}));

import { POST } from "@/app/api/proposal/route";
import { fetchAllowedThemes, fetchEffectSentences, fetchLayoutItems, fetchPrices, fetchRules } from "@/lib/rules-source";
import { getUsageSummary } from "@/lib/usage-limit";

const ITEMS = [
  { theme: "공영주차장", name: "주차 1면", icon: "🚗", areaM2: 25, units: 1, unitLabel: "면", sortOrder: 1 },
  { theme: "공영주차장", name: "관리 부스", icon: "🏠", areaM2: 9, units: 0, unitLabel: "", sortOrder: 2 },
];
const LAND = {
  type: "land",
  landCategory: "대",
  zone: "제2종일반주거지역",
  otherZones: [],
  answers: { onbid: "yes", dispute: "no", inUse: "no" },
  theme: "공영주차장",
  area: 500,
  officialPrice: 1_000_000,
  totalFloorArea: null,
  buildingStandardValue: null,
  approvalDate: "",
  edited: [],
};
const call = (body: unknown) =>
  POST(new Request("http://localhost/api/proposal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.mocked(fetchRules).mockReset().mockResolvedValue(loadSeedRules());
  vi.mocked(fetchAllowedThemes).mockReset().mockResolvedValue(["공영주차장", "공유오피스"] as never);
  vi.mocked(fetchPrices).mockReset().mockResolvedValue(loadSeedPrices());
  vi.mocked(fetchEffectSentences).mockReset().mockResolvedValue(["가.", "나.", "다."]);
  vi.mocked(fetchLayoutItems).mockReset().mockResolvedValue(ITEMS);
  vi.mocked(getUsageSummary).mockReset().mockResolvedValue({ simulate: { limit: 5, used: 5, remaining: 0 } } as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/proposal — 배치", () => {
  it("배치한 주차면 수로 수익을 계산하고, 배치 내용을 돌려준다", async () => {
    const res = await call({ ...LAND, layout: [{ name: "주차 1면", count: 8 }, { name: "관리 부스", count: 1 }] });
    expect(res.status).toBe(200);
    const body = (await res.json()).data;
    expect(body.income).toMatchObject({ ok: true, min: 8 * 40000 * 12, max: 8 * 120000 * 12, basedOnLayout: true });
    expect(body.layout).toEqual({
      lines: [
        { name: "주차 1면", icon: "🚗", count: 8, area: 200 },
        { name: "관리 부스", icon: "🏠", count: 1, area: 9 },
      ],
      totalArea: 209,
    });
  });
  it("배치하지 않으면 기존처럼 면적으로 계산하고 layout 은 null", async () => {
    const body = (await (await call(LAND)).json()).data;
    expect(body.layout).toBeNull();
    expect(body.income.basedOnLayout).toBeFalsy();
    expect(fetchLayoutItems).not.toHaveBeenCalled();
  });
  it("면적 합이 필지 면적을 넘으면 400 (20면=500㎡ 통과, 21면=525㎡ 거절)", async () => {
    expect((await call({ ...LAND, layout: [{ name: "주차 1면", count: 20 }] })).status).toBe(200);
    const res = await call({ ...LAND, layout: [{ name: "주차 1면", count: 21 }] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("필지 면적");
  });
  it("표에 없는 시설물 이름은 400", async () => {
    expect((await call({ ...LAND, layout: [{ name: "없는 시설", count: 1 }] })).status).toBe(400);
  });
  it("건물 진단에서는 배치를 받지 않는다 (400)", async () => {
    const building = { ...LAND, type: "building", theme: "공유오피스", answers: { ...LAND.answers, safety: "no" }, totalFloorArea: 1000, approvalDate: "2010-01-01" };
    expect((await call({ ...building, layout: [{ name: "주차 1면", count: 1 }] })).status).toBe(400);
  });
  it("개수가 이상하면(0개·소수) 모양 검사에서 400", async () => {
    expect((await call({ ...LAND, layout: [{ name: "주차 1면", count: 0 }] })).status).toBe(400);
    expect((await call({ ...LAND, layout: [{ name: "주차 1면", count: 2.5 }] })).status).toBe(400);
  });
});
