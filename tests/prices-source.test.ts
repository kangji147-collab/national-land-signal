// 단가표 읽기 시험 (lib/rules-source.ts fetchPrices)
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { RulesSourceError, fetchPrices } from "../lib/rules-source";

type Result = { data?: unknown; error?: unknown };
const fake = (r: Result) => ({ from: () => ({ select: () => ({ range: async () => r }) }) }) as unknown as SupabaseClient;

const ROW = { theme: "스마트팜", item: "㎡당 연 매출", min_value: "150000", max_value: 400000, unit: "원/㎡/년", source: "예시", base_year: 2026 };

describe("fetchPrices", () => {
  it("줄을 읽어 숫자로 바꿔 돌려준다 (numeric 열이 글자로 와도 된다)", async () => {
    expect(await fetchPrices(fake({ data: [ROW] }))).toEqual([{ ...ROW, min_value: 150000 }]);
  });
  it("읽기 오류·이상한 줄(최대<최소, 글자 숫자 아님)·너무 큰 표는 오류", async () => {
    await expect(fetchPrices(fake({ error: { message: "x" } }))).rejects.toBeInstanceOf(RulesSourceError);
    await expect(fetchPrices(fake({ data: [{ ...ROW, min_value: 10, max_value: 5 }] }))).rejects.toBeInstanceOf(RulesSourceError);
    await expect(fetchPrices(fake({ data: [{ ...ROW, min_value: "abc" }] }))).rejects.toBeInstanceOf(RulesSourceError);
    await expect(fetchPrices(fake({ data: new Array(1000).fill(ROW) }))).rejects.toBeInstanceOf(RulesSourceError);
  });
});
