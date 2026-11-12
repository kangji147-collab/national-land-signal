// Design Ref: §4.3 — 하루 사용 횟수 제한 (주소 조회 20회 · 시뮬레이션 5회)
// Plan SC: "하루 사용 횟수 제한: 실패는 미차감, 동시에 눌러도 한도를 넘지 않음"
//
// 약속
//  - 접속 주소(IP)는 그대로 저장하지 않고, 비밀 소금값(IP_HASH_SALT)을 섞어 해시한 값만 저장한다.
//  - 날짜는 한국 시간 0시 기준 (DB 함수가 처리).
//  - 먼저 1회를 "잡고"(남은 횟수가 있을 때만 DB가 한 번에 확인+증가) → 작업 실행 → 실패하면 "돌려준다".
//  - 횟수 확인에 실패하면(DB 오류) 작업을 실행하지 않는다. (비용 남용을 막기 위해 닫는 쪽으로 실패)
//  - 작업이 예외를 던지면 돌려주고, 정상 응답으로 "정보 없음"을 값으로 돌려주면 돌려주지 않는다.
//    (없는 필지를 반복 조회해서 공공 API 호출 한도를 닳게 하는 것을 막기 위함)
import { createHmac } from "node:crypto";
import { MESSAGES } from "./messages";
import { createServiceClient } from "./supabase";

/**
 * 횟수 종류 (DB 종류 이름과 같다)
 *  - read = 주소 조회(정보 가져오기, 20회), simulate = 시뮬레이션(5회)
 *  - search = 주소 검색(100회) — 공공 API 호출 한도가 닳는 것을 막으려고 둔 별도 상한 (사용자 결정 2026-11-12)
 */
export type UsageKind = "read" | "simulate" | "search";

export const USAGE_LIMITS: Record<UsageKind, number> = { read: 20, simulate: 5, search: 100 };

const LIMIT_MESSAGE: Record<UsageKind, string> = {
  read: MESSAGES.readLimit,
  simulate: MESSAGES.simulateLimit,
  search: MESSAGES.searchLimit,
};

/** 횟수를 저장하는 곳. 실제는 Supabase, 시험에서는 가짜를 끼운다. */
export interface UsageStore {
  /** 남은 횟수가 있을 때만 +1 하고 true, 한도에 도달했으면 false (한 번에, 동시에 불러도 안전해야 함) */
  reserve(ipHash: string, kind: UsageKind, limit: number): Promise<boolean>;
  /** 잡아 둔 1회를 돌려준다 (0 아래로는 내려가지 않음) */
  release(ipHash: string, kind: UsageKind): Promise<void>;
  /** 오늘 쓴 횟수 */
  count(ipHash: string, kind: UsageKind): Promise<number>;
}

export class UsageStoreError extends Error {
  constructor(what: string) {
    super(`사용 횟수 저장소 오류: ${what}`); // 주소·키 같은 값은 넣지 않는다
    this.name = "UsageStoreError";
  }
}

/** 한국 시간 기준 오늘 날짜 (YYYY-MM-DD) */
export function todayKst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Supabase(service_role)에 연결한 실제 저장소. 3·4번에서 만든 DB 함수를 부른다. */
export function createSupabaseUsageStore(client = createServiceClient()): UsageStore {
  return {
    async reserve(ipHash, kind, limit) {
      const { data, error } = await client.rpc("reserve_usage", { p_ip_hash: ipHash, p_kind: kind, p_limit: limit });
      if (error) throw new UsageStoreError("reserve 실패");
      return data === true;
    },
    async release(ipHash, kind) {
      const { error } = await client.rpc("release_usage", { p_ip_hash: ipHash, p_kind: kind });
      if (error) throw new UsageStoreError("release 실패");
    },
    async count(ipHash, kind) {
      const { data, error } = await client
        .from("usage_counts")
        .select("count")
        .eq("ip_hash", ipHash)
        .eq("kind", kind)
        .eq("day", todayKst())
        .maybeSingle();
      if (error) throw new UsageStoreError("count 실패");
      return data?.count ?? 0;
    },
  };
}

/**
 * 요청 헤더에서 접속 주소를 읽는다.
 * Vercel이 직접 채워 주는 헤더를 먼저 쓴다. (사용자가 임의로 보낸 값은 믿지 않기 위함)
 * ※ 배포(작업 23번) 때 Vercel 문서로 어느 헤더를 믿을지 다시 확인한다.
 */
export function getClientIp(headers: Headers): string {
  const first = (name: string) => headers.get(name)?.split(",")[0]?.trim() || undefined;
  return first("x-vercel-forwarded-for") ?? first("x-real-ip") ?? first("x-forwarded-for") ?? "unknown";
}

/** 접속 주소를 소금값과 섞어 해시한다. 같은 주소·같은 소금이면 항상 같은 값, 원래 주소는 복원할 수 없다. */
export function hashIp(ip: string, salt: string | undefined = process.env.IP_HASH_SALT): string {
  if (!salt || salt.length < 16) throw new Error("IP_HASH_SALT 값이 없거나 너무 짧아요");
  return createHmac("sha256", salt).update(ip).digest("hex");
}

export interface Reservation {
  ok: true;
  /** 잡아 둔 1회를 돌려준다. 여러 번 불러도 한 번만 돌려준다. */
  release: () => Promise<void>;
}
export interface LimitExceeded {
  ok: false;
  code: "LIMIT_EXCEEDED";
  message: string;
}

/** 먼저 1회를 잡는다. 한도에 도달했으면 PRD 문구와 함께 LIMIT_EXCEEDED. DB 오류는 예외로 던진다(작업을 실행하지 않음). */
export async function reserveUsage(
  store: UsageStore,
  kind: UsageKind,
  ip: string,
  salt?: string,
): Promise<Reservation | LimitExceeded> {
  const ipHash = hashIp(ip, salt);
  const reserved = await store.reserve(ipHash, kind, USAGE_LIMITS[kind]);
  if (!reserved) return { ok: false, code: "LIMIT_EXCEEDED", message: LIMIT_MESSAGE[kind] };

  let released = false;
  return {
    ok: true,
    release: async () => {
      if (released) return;
      released = true;
      await store.release(ipHash, kind);
    },
  };
}

export interface RunOptions<T> {
  /** 작업이 예외를 던졌을 때 돌려줄지 (기본: 돌려준다) */
  refundOnError?: boolean;
  /** 작업이 값을 돌려줬을 때 그 값이 "실패"라서 돌려줘야 하면 true (예: AI가 실패 결과를 값으로 돌려준 경우) */
  refundWhen?: (value: T) => boolean;
  salt?: string;
}

/**
 * 횟수를 잡고 → 작업 실행 → 실패하면 돌려준다.
 *  - 한도에 도달: 작업을 실행하지 않고 LIMIT_EXCEEDED
 *  - 작업이 예외를 던짐: 돌려주고 같은 예외를 다시 던진다
 *  - 작업이 값을 돌려줌: 기본은 그대로 차감 (정상 응답)
 */
export async function runWithUsage<T>(
  store: UsageStore,
  kind: UsageKind,
  ip: string,
  task: () => Promise<T>,
  options: RunOptions<T> = {},
): Promise<{ ok: true; value: T } | LimitExceeded> {
  const reservation = await reserveUsage(store, kind, ip, options.salt);
  if (!reservation.ok) return reservation;

  let value: T;
  try {
    value = await task();
  } catch (error) {
    if (options.refundOnError !== false) await safeRelease(reservation);
    throw error;
  }
  if (options.refundWhen?.(value)) await safeRelease(reservation);
  return { ok: true, value };
}

// 돌려주기가 실패해도 원래 오류를 가리지 않는다. (내용은 로그에 남기지 않음)
async function safeRelease(reservation: Reservation): Promise<void> {
  try {
    await reservation.release();
  } catch {
    console.error("사용 횟수 돌려주기에 실패했어요");
  }
}

export interface UsageInfo {
  limit: number;
  used: number;
  remaining: number;
}
export type UsageSummary = Record<UsageKind, UsageInfo>;

/** 오늘 남은 횟수 (화면 표시용) */
export async function getUsageSummary(store: UsageStore, ip: string, salt?: string): Promise<UsageSummary> {
  const ipHash = hashIp(ip, salt);
  const kinds: UsageKind[] = ["read", "simulate", "search"];
  const counts = await Promise.all(kinds.map((k) => store.count(ipHash, k)));
  const summary = {} as UsageSummary;
  kinds.forEach((k, i) => {
    const limit = USAGE_LIMITS[k];
    const used = Math.min(counts[i], limit);
    summary[k] = { limit, used, remaining: limit - used };
  });
  return summary;
}
