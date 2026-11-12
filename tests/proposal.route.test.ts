// /api/proposal 시험: 표 읽기만 가짜로 바꿔 끼우고, 실제 판정·계산 규칙과 예시 데이터(seed.sql)로 응답을 확인한다.
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
}));
vi.mock("@/lib/openai", () => ({ polishText: vi.fn() }));
// 이 시험은 요청마다 AI 호출 결과를 확인하므로 기억 장치는 끈다 (기억 동작은 polish-cache.test.ts 에서 시험)
vi.mock("@/lib/polish-cache", () => ({ withPolishCache: (fn: unknown) => fn }));
vi.mock("@/lib/usage-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/usage-limit")>()),
  createSupabaseUsageStore: vi.fn(() => ({})),
  getUsageSummary: vi.fn(),
}));

import { POST } from "@/app/api/proposal/route";
import { polishText } from "@/lib/openai";
import { RulesSourceError, fetchAllowedThemes, fetchEffectSentences, fetchPrices, fetchRules } from "@/lib/rules-source";
import { getUsageSummary } from "@/lib/usage-limit";

const rules = vi.mocked(fetchRules);
const themes = vi.mocked(fetchAllowedThemes);
const prices = vi.mocked(fetchPrices);
const effectRows = vi.mocked(fetchEffectSentences);
const polish = vi.mocked(polishText);
const usage = vi.mocked(getUsageSummary);
const BASE = ["가 문장입니다.", "나 문장입니다.", "다 문장입니다."];
const left = (n: number) => ({ simulate: { limit: 5, used: 5 - n, remaining: n } }) as never;

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
const BUILDING = {
  ...LAND,
  type: "building",
  theme: "공유오피스",
  answers: { ...LAND.answers, safety: "no" },
  totalFloorArea: 1000,
  buildingStandardValue: 200_000_000,
  approvalDate: "1990-05-01",
};
const call = (body: unknown) =>
  POST(new Request("http://localhost/api/proposal", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  rules.mockReset().mockResolvedValue(loadSeedRules());
  themes.mockReset().mockResolvedValue(["공영주차장", "소공원"] as never);
  prices.mockReset().mockResolvedValue(loadSeedPrices());
  effectRows.mockReset().mockResolvedValue(BASE);
  polish
    .mockReset()
    .mockResolvedValue(JSON.stringify({ effects: ["가 문장을 다듬었어요.", "나 문장을 다듬었어요.", "다 문장을 다듬었어요."] }));
  usage.mockReset().mockResolvedValue(left(3));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/proposal", () => {
  it("🟢 토지: 수익 범위와 매수 가격을 계산해 돌려준다", async () => {
    const res = await call(LAND);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.income.ok).toBe(true);
    // 500㎡ ÷ 25㎡ = 20면 × 월 4만~12만 원 × 12개월
    expect(data.income.min).toBe(20 * 40_000 * 12);
    expect(data.income.max).toBe(20 * 120_000 * 12);
    expect(data.price).toMatchObject({ ok: true, amount: 500_000_000, buildingExcluded: false });
    expect(data.oldBuilding).toBeNull();
  });

  it("건물: 시가표준액을 더하고, 비우면 건물분 미포함, 30년 넘으면 노후", async () => {
    themes.mockResolvedValue(["공유오피스"] as never);
    let { data } = await (await call(BUILDING)).json();
    expect(data.price).toMatchObject({ ok: true, amount: 500_000_000 + 200_000_000, buildingExcluded: false });
    expect(data.oldBuilding.status).toBe("old");

    ({ data } = await (await call({ ...BUILDING, buildingStandardValue: null, approvalDate: "" })).json());
    expect(data.price).toMatchObject({ ok: true, amount: 500_000_000, buildingExcluded: true });
    expect(data.oldBuilding.status).toBe("unknown");
  });

  it("수정한 값은 '민원인이 수정한 값 기준'으로 표시된다", async () => {
    const { data } = await (await call({ ...LAND, edited: ["area"] })).json();
    expect(data.income.basedOnUserEdited).toBe(true);
    expect(data.price.basedOnUserEdited).toBe(true);
  });

  it("공시지가가 없으면 매수 가격만 계산 불가, 수익은 나온다", async () => {
    const { data } = await (await call({ ...LAND, officialPrice: null })).json();
    expect(data.income.ok).toBe(true);
    expect(data.price.ok).toBe(false);
  });

  it("🟢가 아니면 거절한다 (브라우저가 보낸 값이 아니라 서버가 다시 판정)", async () => {
    const res = await call({ ...LAND, answers: { onbid: "unknown", dispute: "no", inUse: "no" } });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("NOT_GREEN");
  });

  it("허용되지 않은 테마면 거절한다", async () => {
    const res = await call({ ...LAND, theme: "태양광" });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("THEME_NOT_ALLOWED");
  });

  it("종류와 다른 테마가 허용표에 있어도 계산은 거절한다 (토지에 건물 테마)", async () => {
    themes.mockResolvedValue(["공유오피스"] as never);
    const { data } = await (await call({ ...LAND, theme: "공유오피스" })).json();
    expect(data.income.ok).toBe(false);
    expect(data.income.code).toBe("THEME_MISMATCH");
  });

  it("입력이 이상하면 400 (음수·소수 시가표준액, 빈 본문)", async () => {
    expect((await call({ ...BUILDING, buildingStandardValue: -1 })).status).toBe(400);
    expect((await call({ ...BUILDING, buildingStandardValue: 1.5 })).status).toBe(400);
    expect((await call({ ...LAND, area: 0 })).status).toBe(400);
    expect((await call("not json")).status).toBe(400);
  });

  it("기대효과: 남은 횟수가 있으면 AI가 다듬은 문장(ai)을 쓴다", async () => {
    const { data } = await (await call(LAND)).json();
    expect(data.effects.source).toBe("ai");
    expect(data.effects.sentences).toHaveLength(3);
    // OpenAI로는 주소·면적·공시지가를 보내지 않는다 (테마·문장표 문장만)
    const sent = JSON.stringify(polish.mock.calls[0]);
    expect(sent).toContain("공영주차장");
    expect(sent).not.toMatch(/500|1000000|제2종/);
  });

  it("기대효과: 시뮬레이션 횟수를 모두 썼으면 AI 없이 문장표 기본 문장(table)", async () => {
    usage.mockResolvedValue(left(0));
    const { data } = await (await call(LAND)).json();
    expect(data.effects).toEqual({ sentences: BASE, source: "table" });
    expect(polish).not.toHaveBeenCalled();
  });

  it("기대효과: 횟수 확인이 실패하거나 AI가 실패해도 제안서는 나온다 (문장표 기본 문장)", async () => {
    usage.mockRejectedValue(new Error("x"));
    let res = await call(LAND);
    expect(res.status).toBe(200);
    expect((await res.json()).data.effects.source).toBe("table");

    usage.mockResolvedValue(left(2));
    polish.mockRejectedValue(new Error("sk-secret"));
    res = await call(LAND);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.effects).toEqual({ sentences: BASE, source: "table" });
    expect(JSON.stringify(body)).not.toContain("sk-secret");
  });

  it("기대효과: AI가 새 숫자를 만들면 버리고 기본 문장을 쓴다", async () => {
    polish.mockResolvedValue(JSON.stringify({ effects: ["가 문장, 방문객 30% 증가", "나 문장입니다.", "다 문장입니다."] }));
    const { data } = await (await call(LAND)).json();
    expect(data.effects).toEqual({ sentences: BASE, source: "table" });
  });

  it("기대효과 문장표를 읽지 못하면 500", async () => {
    effectRows.mockRejectedValue(new RulesSourceError("비밀"));
    expect((await call(LAND)).status).toBe(500);
  });

  it("표를 읽지 못하면 500 (내용 노출 없음)", async () => {
    prices.mockRejectedValue(new RulesSourceError("비밀 표 내용"));
    const res = await call(LAND);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("비밀");
  });
});
