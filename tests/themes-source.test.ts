// 테마 허용표 읽기 시험 (lib/rules-source.ts fetchAllowedThemes + /api/themes)
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { RulesSourceError, fetchAllowedThemes } from "../lib/rules-source";

type Result = { data?: unknown; error?: unknown };
const fake = (r: Result) =>
  ({ from: () => ({ select: () => ({ eq: () => ({ range: async () => r }) }) }) }) as unknown as SupabaseClient;

const L = (zone: string, theme: string) => ({ target: "land", zone, theme });
const TABLE = [
  L("제2종일반주거지역", "소공원"),
  L("제2종일반주거지역", "공영주차장"),
  L("제2종일반주거지역", "스마트팜"),
  L("보전녹지지역", "태양광"),
];

describe("fetchAllowedThemes", () => {
  it("그 용도지역에 허용된 테마만, 전체 목록 순서(공영주차장→스마트팜→태양광→소공원)로 돌려준다", async () => {
    expect(await fetchAllowedThemes(fake({ data: TABLE }), "land", "제2종일반주거지역")).toEqual(["공영주차장", "스마트팜", "소공원"]);
    expect(await fetchAllowedThemes(fake({ data: TABLE }), "land", "보전녹지지역")).toEqual(["태양광"]);
  });
  it("괄호·법령 이름·공백이 붙은 이름도 같은 용도지역으로 본다 (양쪽 모두)", async () => {
    const t = [L("제2종 일반주거지역(국토계획법)", "소공원")];
    expect(await fetchAllowedThemes(fake({ data: t }), "land", "제2종일반주거지역")).toEqual(["소공원"]);
    expect(await fetchAllowedThemes(fake({ data: TABLE }), "land", "제2종일반주거지역<국토의 계획 및 이용에 관한 법률>")).toHaveLength(3);
  });
  it("표에 없는 용도지역·빈 용도지역은 빈 목록", async () => {
    expect(await fetchAllowedThemes(fake({ data: TABLE }), "land", "일반상업지역")).toEqual([]);
    expect(await fetchAllowedThemes(fake({ data: TABLE }), "land", "")).toEqual([]);
  });
  it("읽기 오류·이상한 줄·너무 큰 표는 오류", async () => {
    await expect(fetchAllowedThemes(fake({ error: { message: "x" } }), "land", "a")).rejects.toBeInstanceOf(RulesSourceError);
    await expect(fetchAllowedThemes(fake({ data: [{ target: "land", zone: 1, theme: "소공원" }] }), "land", "a")).rejects.toBeInstanceOf(RulesSourceError);
    await expect(fetchAllowedThemes(fake({ data: new Array(1000).fill(L("a", "소공원")) }), "land", "a")).rejects.toBeInstanceOf(RulesSourceError);
  });
});
