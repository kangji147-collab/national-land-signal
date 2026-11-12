// 기대효과 문장표 읽기 시험 (lib/rules-source.ts fetchEffectSentences)
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { RulesSourceError, fetchEffectSentences } from "../lib/rules-source";

type Result = { data?: unknown; error?: unknown };
const fake = (r: Result) =>
  ({ from: () => ({ select: () => ({ eq: () => ({ order: () => ({ range: async () => r }) }) }) }) }) as unknown as SupabaseClient;

describe("fetchEffectSentences", () => {
  it("문장을 순서대로 돌려준다 (앞뒤 공백 제거)", async () => {
    const data = [{ sentence: " 가 ", sort_order: 1 }, { sentence: "나", sort_order: 2 }];
    expect(await fetchEffectSentences(fake({ data }), "소공원")).toEqual(["가", "나"]);
    expect(await fetchEffectSentences(fake({ data: [] }), "소공원")).toEqual([]);
  });
  it("읽기 오류·이상한 줄은 오류", async () => {
    await expect(fetchEffectSentences(fake({ error: { message: "x" } }), "a")).rejects.toBeInstanceOf(RulesSourceError);
    await expect(fetchEffectSentences(fake({ data: [{ sentence: 5 }] }), "a")).rejects.toBeInstanceOf(RulesSourceError);
    await expect(fetchEffectSentences(fake({ data: [{ sentence: "  " }] }), "a")).rejects.toBeInstanceOf(RulesSourceError);
  });
});
