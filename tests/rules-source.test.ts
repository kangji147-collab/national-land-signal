// 규칙표·연락처 읽기 시험 (lib/rules-source.ts): 가짜 Supabase 로 읽기 결과 정리와 오류 처리를 확인한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { MAX_RULE_ROWS, RulesSourceError, fetchContact, fetchRules } from "../lib/rules-source";

type Result = { data?: unknown; error?: unknown };
/** from(표).select().range()/limit() 가 정해 둔 결과를 돌려주는 가짜 연결 */
const fake = (tables: Record<string, Result>) =>
  ({ from: (t: string) => ({ select: () => ({ range: async () => tables[t], limit: async () => tables[t] }) }) }) as unknown as SupabaseClient;

const row = (over: Record<string, unknown> = {}) => ({
  category: "지목",
  name: "대",
  signal: "green",
  reason: "[예시] 건축용 대지",
  base_year: 2026,
  ...over,
});

describe("규칙표 읽기", () => {
  it("줄을 판정 규칙이 받는 모양으로 정리한다", async () => {
    const rules = await fetchRules(fake({ rules: { data: [row(), row({ category: "질문", name: "onbid:no", signal: "yellow" })] } }));
    expect(rules).toEqual([
      { category: "지목", name: "대", signal: "green", reason: "[예시] 건축용 대지", base_year: 2026 },
      { category: "질문", name: "onbid:no", signal: "yellow", reason: "[예시] 건축용 대지", base_year: 2026 },
    ]);
  });

  it("표가 비어 있으면 빈 목록 (오류가 아님 — 판정은 모두 🟡가 됨)", async () => {
    expect(await fetchRules(fake({ rules: { data: [] } }))).toEqual([]);
  });

  it("읽기에 실패하면 오류 (빈 규칙으로 판정하지 않는다)", async () => {
    await expect(fetchRules(fake({ rules: { error: { message: "db down" } } }))).rejects.toBeInstanceOf(RulesSourceError);
    await expect(fetchRules(fake({ rules: { data: null } }))).rejects.toBeInstanceOf(RulesSourceError);
  });

  it("오류 메시지에 DB 내용이 들어가지 않는다", async () => {
    const err = await fetchRules(fake({ rules: { error: { message: "secret-detail-xyz" } } })).catch((e) => e);
    expect(String(err.message)).not.toContain("secret-detail-xyz");
  });

  it.each([
    ["구분이 이상함", { category: "없는구분" }],
    ["판정이 이상함", { signal: "blue" }],
    ["이름이 숫자", { name: 5 }],
    ["근거가 비어 있음(null)", { reason: null }],
    ["기준 연도가 글자", { base_year: "2026" }],
  ])("이상한 줄(%s)이 있으면 오류", async (_label, over) => {
    await expect(fetchRules(fake({ rules: { data: [row(), row(over)] } }))).rejects.toBeInstanceOf(RulesSourceError);
  });

  it("1000줄을 꽉 채워 받으면 뒤가 잘렸을 수 있으니 오류", async () => {
    const full = Array.from({ length: MAX_RULE_ROWS }, (_, i) => row({ name: `대${i}` }));
    await expect(fetchRules(fake({ rules: { data: full } }))).rejects.toBeInstanceOf(RulesSourceError);
    const almost = Array.from({ length: MAX_RULE_ROWS - 1 }, (_, i) => row({ name: `대${i}` }));
    expect(await fetchRules(fake({ rules: { data: almost } }))).toHaveLength(MAX_RULE_ROWS - 1);
  });
});

describe("상담 연락처 읽기", () => {
  it("첫 줄을 돌려준다", async () => {
    const c = await fetchContact(fake({ contacts: { data: [{ name: "상담", phone: "1588-0000", hours: "평일 9시~18시", extra: "무시" }] } }));
    expect(c).toEqual({ name: "상담", phone: "1588-0000", hours: "평일 9시~18시" });
  });

  it("표가 비어 있으면 null (화면이 일반 안내로 대신함)", async () => {
    expect(await fetchContact(fake({ contacts: { data: [] } }))).toBeNull();
  });

  it("읽기 실패·이상한 값이면 오류", async () => {
    await expect(fetchContact(fake({ contacts: { error: { message: "x" } } }))).rejects.toBeInstanceOf(RulesSourceError);
    await expect(fetchContact(fake({ contacts: { data: [{ name: "상담", phone: null, hours: "x" }] } }))).rejects.toBeInstanceOf(
      RulesSourceError,
    );
  });
});
