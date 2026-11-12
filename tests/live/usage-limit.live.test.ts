// 실제 Supabase DB로 횟수 제한을 시험한다. (기본 `npm test`에서는 건너뜀)
// 실행:  bash →  RUN_LIVE_TESTS=1 npm test        PowerShell →  $env:RUN_LIVE_TESTS=1; npm test
// - 시험용 가짜 접속 주소 해시('__test__...')만 쓰고, 끝나면 그 줄을 지운다. 실제 사용자 횟수는 건드리지 않는다.
// - .env 의 값은 읽기만 하고 출력하지 않는다.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { createSupabaseUsageStore } from "../../lib/usage-limit";

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
const enabled =
  process.env.RUN_LIVE_TESTS === "1" && !!env.SUPABASE_URL && !!env.SUPABASE_SERVICE_ROLE_KEY && !!env.SUPABASE_ANON_KEY;

const service = enabled
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;
const anon = enabled ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } }) : null;
const store = enabled ? createSupabaseUsageStore(service!) : null;

const run = Date.now().toString(36);
const hash = (n: string) => `__test__${run}_${n}`;

afterAll(async () => {
  if (service) await service.from("usage_counts").delete().like("ip_hash", `__test__${run}%`);
});

describe.skipIf(!enabled)("실제 DB 횟수 제한 (RUN_LIVE_TESTS=1)", () => {
  it("한도 3회로 동시에 8번 잡아도 정확히 3번만 성공한다 (동시성)", async () => {
    const h = hash("concurrent");
    const results = await Promise.all(Array.from({ length: 8 }, () => store!.reserve(h, "simulate", 3)));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await store!.count(h, "simulate")).toBe(3);
  });

  it("돌려주면 다시 잡을 수 있고, 0 아래로는 내려가지 않는다", async () => {
    const h = hash("release");
    expect(await store!.reserve(h, "read", 1)).toBe(true);
    expect(await store!.reserve(h, "read", 1)).toBe(false);
    await store!.release(h, "read");
    expect(await store!.count(h, "read")).toBe(0);
    await store!.release(h, "read"); // 이미 0
    expect(await store!.count(h, "read")).toBe(0);
    expect(await store!.reserve(h, "read", 1)).toBe(true);
  });

  it("주소 검색(search) 종류도 DB에서 잡고 돌려줄 수 있다 (마이그레이션 002 적용 확인)", async () => {
    const h = hash("search");
    expect(await store!.reserve(h, "search", 2)).toBe(true);
    expect(await store!.reserve(h, "search", 2)).toBe(true);
    expect(await store!.reserve(h, "search", 2)).toBe(false);
    await store!.release(h, "search");
    expect(await store!.count(h, "search")).toBe(1);
  });

  it("종류별로 따로 센다", async () => {
    const h = hash("kinds");
    expect(await store!.reserve(h, "read", 1)).toBe(true);
    expect(await store!.reserve(h, "simulate", 1)).toBe(true);
    expect(await store!.count(h, "read")).toBe(1);
    expect(await store!.count(h, "simulate")).toBe(1);
  });

  it("웹(anon 키)으로는 횟수 함수도 표도 접근할 수 없다 (RLS·권한)", async () => {
    const fn = await anon!.rpc("reserve_usage", { p_ip_hash: hash("anon"), p_kind: "read", p_limit: 20 });
    expect(fn.error).toBeTruthy();
    const read = await anon!.from("usage_counts").select("*").limit(1);
    expect(read.error).toBeTruthy();
  });
});
