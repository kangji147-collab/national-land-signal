// 사용 횟수 제한 시험 (가짜 저장소 사용 — DB에 접속하지 않음)
// 실제 DB 동시성 시험은 tests/live/usage-limit.live.test.ts (RUN_LIVE_TESTS=1 일 때만 실행)
import { describe, expect, it } from "vitest";
import {
  USAGE_LIMITS,
  getClientIp,
  getUsageSummary,
  hashIp,
  reserveUsage,
  runWithUsage,
  todayKst,
} from "../lib/usage-limit";
import type { UsageKind, UsageStore } from "../lib/usage-limit";

const SALT = "test-salt-0123456789abcdef";

/** DB 함수(reserve_usage / release_usage)와 같은 규칙을 가진 가짜 저장소 */
function fakeStore() {
  const counts = new Map<string, number>();
  const key = (h: string, k: UsageKind) => `${h}|${k}`;
  const store: UsageStore & { counts: Map<string, number>; failReserve?: boolean } = {
    counts,
    async reserve(h, k, limit) {
      if (store.failReserve) throw new Error("DB 장애");
      const c = counts.get(key(h, k)) ?? 0;
      if (c >= limit) return false;
      counts.set(key(h, k), c + 1);
      return true;
    },
    async release(h, k) {
      counts.set(key(h, k), Math.max((counts.get(key(h, k)) ?? 0) - 1, 0));
    },
    async count(h, k) {
      return counts.get(key(h, k)) ?? 0;
    },
  };
  return store;
}

const used = (s: ReturnType<typeof fakeStore>, ip: string, kind: UsageKind) => s.count(hashIp(ip, SALT), kind);

describe("한도", () => {
  it("한도는 주소 조회 20회, 시뮬레이션 5회 (PRD), 주소 검색 100회 (사용자 결정)", () => {
    expect(USAGE_LIMITS).toEqual({ read: 20, simulate: 5, search: 100 });
  });

  it("주소 조회는 20번까지 성공하고 21번째는 PRD 문구와 함께 거절", async () => {
    const s = fakeStore();
    for (let i = 0; i < 20; i++) expect((await reserveUsage(s, "read", "1.1.1.1", SALT)).ok, `${i + 1}번째`).toBe(true);
    const r = await reserveUsage(s, "read", "1.1.1.1", SALT);
    expect(r).toEqual({
      ok: false,
      code: "LIMIT_EXCEEDED",
      message: "오늘 주소 조회 횟수를 모두 썼어요(20/20). 내일 0시에 다시 이용할 수 있어요",
    });
  });

  it("시뮬레이션은 5번까지, 6번째는 PRD 문구와 함께 거절", async () => {
    const s = fakeStore();
    for (let i = 0; i < 5; i++) expect((await reserveUsage(s, "simulate", "1.1.1.1", SALT)).ok).toBe(true);
    const r = await reserveUsage(s, "simulate", "1.1.1.1", SALT);
    expect(r).toMatchObject({ ok: false, message: "오늘 시뮬레이션 횟수를 모두 썼어요(5/5). 내일 0시에 다시 이용할 수 있어요" });
  });

  it("주소 검색은 100번까지 성공하고 101번째는 거절 + 문구", async () => {
    const s = fakeStore();
    for (let i = 0; i < 100; i++) expect((await reserveUsage(s, "search", "1.1.1.1", SALT)).ok, `${i + 1}번째`).toBe(true);
    const r = await reserveUsage(s, "search", "1.1.1.1", SALT);
    expect(r).toEqual({
      ok: false,
      code: "LIMIT_EXCEEDED",
      message: "오늘 주소 검색 횟수를 모두 썼어요(100/100). 내일 0시에 다시 이용할 수 있어요",
    });
  });

  it("주소 검색을 다 써도 정보 가져오기(주소 조회)·시뮬레이션은 영향이 없다 (따로 센다)", async () => {
    const s = fakeStore();
    for (let i = 0; i < 100; i++) await reserveUsage(s, "search", "1.1.1.1", SALT);
    expect((await reserveUsage(s, "search", "1.1.1.1", SALT)).ok).toBe(false);
    expect((await reserveUsage(s, "read", "1.1.1.1", SALT)).ok).toBe(true);
    expect((await reserveUsage(s, "simulate", "1.1.1.1", SALT)).ok).toBe(true);
  });

  it("종류별·접속 주소별로 따로 센다", async () => {
    const s = fakeStore();
    for (let i = 0; i < 5; i++) await reserveUsage(s, "simulate", "1.1.1.1", SALT);
    expect((await reserveUsage(s, "simulate", "1.1.1.1", SALT)).ok).toBe(false);
    expect((await reserveUsage(s, "read", "1.1.1.1", SALT)).ok).toBe(true); // 다른 종류
    expect((await reserveUsage(s, "simulate", "2.2.2.2", SALT)).ok).toBe(true); // 다른 사람
  });

  it("동시에 30번 눌러도 정확히 20번만 성공한다", async () => {
    const s = fakeStore();
    const results = await Promise.all(Array.from({ length: 30 }, () => reserveUsage(s, "read", "3.3.3.3", SALT)));
    expect(results.filter((r) => r.ok)).toHaveLength(20);
    expect(await used(s, "3.3.3.3", "read")).toBe(20);
  });
});

describe("돌려주기 (실패는 차감하지 않음)", () => {
  it("돌려주면 다시 쓸 수 있다", async () => {
    const s = fakeStore();
    const r = await reserveUsage(s, "simulate", "1.1.1.1", SALT);
    if (!r.ok) throw new Error("잡기 실패");
    expect(await used(s, "1.1.1.1", "simulate")).toBe(1);
    await r.release();
    expect(await used(s, "1.1.1.1", "simulate")).toBe(0);
  });

  it("같은 예약을 여러 번 돌려줘도 한 번만 돌려준다", async () => {
    const s = fakeStore();
    await reserveUsage(s, "read", "1.1.1.1", SALT); // 다른 1회
    const r = await reserveUsage(s, "read", "1.1.1.1", SALT);
    if (!r.ok) throw new Error("잡기 실패");
    await r.release();
    await r.release();
    await r.release();
    expect(await used(s, "1.1.1.1", "read")).toBe(1);
  });

  it("작업이 예외를 던지면 돌려주고 같은 예외를 다시 던진다 (공공 API·AI 오류)", async () => {
    const s = fakeStore();
    await expect(
      runWithUsage(s, "read", "1.1.1.1", async () => {
        throw new Error("공공 API 오류");
      }, { salt: SALT }),
    ).rejects.toThrow("공공 API 오류");
    expect(await used(s, "1.1.1.1", "read")).toBe(0);
  });

  it("작업이 정상 값을 돌려주면 차감이 유지된다 (정보 없음도 정상 응답)", async () => {
    const s = fakeStore();
    const r = await runWithUsage(s, "read", "1.1.1.1", async () => ({ found: false }), { salt: SALT });
    expect(r).toEqual({ ok: true, value: { found: false } });
    expect(await used(s, "1.1.1.1", "read")).toBe(1);
  });

  it("값이 '실패'를 뜻하면(refundWhen) 돌려준다", async () => {
    const s = fakeStore();
    await runWithUsage(s, "simulate", "1.1.1.1", async () => ({ imageFailed: true }), {
      salt: SALT,
      refundWhen: (v) => v.imageFailed,
    });
    expect(await used(s, "1.1.1.1", "simulate")).toBe(0);
  });

  it("예외를 던져도 돌려주지 않게 설정할 수 있다 (refundOnError: false)", async () => {
    const s = fakeStore();
    await expect(
      runWithUsage(s, "read", "1.1.1.1", async () => { throw new Error("x"); }, { salt: SALT, refundOnError: false }),
    ).rejects.toThrow("x");
    expect(await used(s, "1.1.1.1", "read")).toBe(1);
  });

  it("한도에 도달했으면 작업을 실행하지 않는다", async () => {
    const s = fakeStore();
    for (let i = 0; i < 5; i++) await reserveUsage(s, "simulate", "1.1.1.1", SALT);
    let ran = false;
    const r = await runWithUsage(s, "simulate", "1.1.1.1", async () => { ran = true; return 1; }, { salt: SALT });
    expect(r).toMatchObject({ ok: false, code: "LIMIT_EXCEEDED" });
    expect(ran).toBe(false);
  });

  it("저장소가 고장 나면 작업을 실행하지 않고 오류를 던진다 (닫는 쪽으로 실패)", async () => {
    const s = fakeStore();
    s.failReserve = true;
    let ran = false;
    await expect(runWithUsage(s, "read", "1.1.1.1", async () => { ran = true; return 1; }, { salt: SALT })).rejects.toThrow();
    expect(ran).toBe(false);
  });

  it("돌려주기가 실패해도 원래 오류가 가려지지 않는다", async () => {
    const s = fakeStore();
    s.release = async () => { throw new Error("release 장애"); };
    await expect(
      runWithUsage(s, "read", "1.1.1.1", async () => { throw new Error("원래 오류"); }, { salt: SALT }),
    ).rejects.toThrow("원래 오류");
  });
});

describe("접속 주소 해시", () => {
  it("같은 주소·같은 소금 → 같은 값, 다른 주소/소금 → 다른 값", () => {
    expect(hashIp("1.1.1.1", SALT)).toBe(hashIp("1.1.1.1", SALT));
    expect(hashIp("1.1.1.1", SALT)).not.toBe(hashIp("1.1.1.2", SALT));
    expect(hashIp("1.1.1.1", SALT)).not.toBe(hashIp("1.1.1.1", SALT + "x"));
  });

  it("원래 주소가 들어 있지 않고 64자리 16진수다", () => {
    const h = hashIp("203.0.113.7", SALT);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("203");
  });

  it("소금값이 없거나 너무 짧으면 거절한다", () => {
    expect(() => hashIp("1.1.1.1", "")).toThrow();
    expect(() => hashIp("1.1.1.1", "short")).toThrow();
  });
});

describe("접속 주소 읽기", () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it("Vercel 헤더를 가장 먼저 믿는다", () => {
    expect(
      getClientIp(h({ "x-vercel-forwarded-for": "9.9.9.9", "x-real-ip": "8.8.8.8", "x-forwarded-for": "7.7.7.7" })),
    ).toBe("9.9.9.9");
  });

  it("다음 순서: x-real-ip → x-forwarded-for 첫 값", () => {
    expect(getClientIp(h({ "x-real-ip": "8.8.8.8", "x-forwarded-for": "7.7.7.7" }))).toBe("8.8.8.8");
    expect(getClientIp(h({ "x-forwarded-for": "7.7.7.7, 10.0.0.1" }))).toBe("7.7.7.7");
  });

  it("아무 헤더도 없으면 'unknown' (모두 한 사람으로 묶임 → 더 엄격한 쪽)", () => {
    expect(getClientIp(h({}))).toBe("unknown");
  });
});

describe("남은 횟수 (화면 표시용)", () => {
  it("쓴 횟수만큼 줄어들고 횟수를 깎지 않는다", async () => {
    const s = fakeStore();
    for (let i = 0; i < 3; i++) await reserveUsage(s, "read", "1.1.1.1", SALT);
    await reserveUsage(s, "simulate", "1.1.1.1", SALT);
    const before = await getUsageSummary(s, "1.1.1.1", SALT);
    expect(before).toEqual({
      read: { limit: 20, used: 3, remaining: 17 },
      simulate: { limit: 5, used: 1, remaining: 4 },
      search: { limit: 100, used: 0, remaining: 100 },
    });
    expect(await getUsageSummary(s, "1.1.1.1", SALT)).toEqual(before); // 두 번 불러도 같음
  });

  it("처음 온 사람은 모두 남아 있다", async () => {
    expect(await getUsageSummary(fakeStore(), "5.5.5.5", SALT)).toEqual({
      read: { limit: 20, used: 0, remaining: 20 },
      simulate: { limit: 5, used: 0, remaining: 5 },
      search: { limit: 100, used: 0, remaining: 100 },
    });
  });
});

describe("한국 시간 날짜", () => {
  it("UTC 15시는 한국 다음 날 0시", () => {
    expect(todayKst(new Date("2026-11-11T14:59:59Z"))).toBe("2026-11-11");
    expect(todayKst(new Date("2026-11-11T15:00:00Z"))).toBe("2026-11-12");
  });
});
