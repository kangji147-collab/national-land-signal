// 실제 Supabase 에서 규칙표·연락처를 읽는 시험. (기본 `npm test`에서는 건너뜀)
// 실행:  bash →  RUN_LIVE_TESTS=1 npm test        PowerShell →  $env:RUN_LIVE_TESTS=1; npm test
// 웹과 같은 공개 읽기 키(anon)로만 읽는다. .env 의 값은 읽기만 하고 출력하지 않는다.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { judge } from "../../lib/judge";
import { fetchContact, fetchRules } from "../../lib/rules-source";
import type { JudgeInput } from "../../lib/types";

function loadEnv(): Record<string, string> {
  try {
    const path = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env");
    const out: Record<string, string> = {};
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_]\w*)\s*=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

const env = loadEnv();
const enabled = process.env.RUN_LIVE_TESTS === "1" && !!env.SUPABASE_URL && !!env.SUPABASE_ANON_KEY;
const anon = enabled ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } }) : null;

const OK: JudgeInput["answers"] = { onbid: "yes", dispute: "no", inUse: "no" };

describe.skipIf(!enabled)("실제 규칙표·연락처 읽기 (RUN_LIVE_TESTS=1)", () => {
  it("규칙표를 읽어 오고, 구분(지목·용도지역·지역지구·질문)이 모두 들어 있다", async () => {
    const rules = await fetchRules(anon!);
    expect(rules.length).toBeGreaterThanOrEqual(60);
    for (const c of ["지목", "용도지역", "지역지구", "질문"]) expect(rules.some((r) => r.category === c), c).toBe(true);
  });

  it("상담 연락처 1개를 읽어 온다", async () => {
    const c = await fetchContact(anon!);
    expect(c).not.toBeNull();
    expect(c!.phone.length).toBeGreaterThan(0);
  });

  it("실제 규칙표로 판정하면 🟢·🟡·🔴 가 모두 나온다", async () => {
    const rules = await fetchRules(anon!);
    const base: JudgeInput = { type: "land", landCategory: "대", zone: "제2종일반주거지역", otherZones: [], answers: OK };
    expect(judge(base, rules).signal).toBe("green");
    expect(judge({ ...base, answers: { ...OK, dispute: "unknown" } }, rules).signal).toBe("yellow");
    expect(judge({ ...base, landCategory: "도로" }, rules).signal).toBe("red");
  });

  it("웹 권한으로는 규칙표를 고칠 수 없다 (읽기 전용)", async () => {
    const r = await anon!.from("rules").insert({ category: "지목", name: "__웹쓰기시험__", signal: "green", reason: "x", base_year: 2026 });
    expect(r.error).toBeTruthy();
  });
});
