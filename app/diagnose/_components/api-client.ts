// 서버(/api/*)를 부르는 공통 도우미 — 성공·서버 오류·시간 초과·인터넷 끊김·취소를 한 가지 모양으로 정리한다.
// (주소 검색·정보 가져오기·판정 화면이 함께 쓴다. 오류별 안내는 error-info.ts 가 정한다.)
import { MESSAGES } from "@/lib/messages";
import type { LandInfo } from "@/lib/public-api";

export interface UiError {
  code: string;
  message: string;
  /** 건축물대장 없음일 때 서버가 함께 돌려준 토지 정보 */
  land?: LandInfo;
}

export type ApiResult = { kind: "ok"; data: unknown } | { kind: "error"; error: UiError } | { kind: "aborted" };

export async function callApi(url: string, init: RequestInit, timeoutMs: number, outer: AbortSignal): Promise<ApiResult> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.any([outer, AbortSignal.timeout(timeoutMs)]) });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.data) return { kind: "ok", data: json.data };
    const e = json?.error;
    return {
      kind: "error",
      error: { code: e?.code ?? "SERVER_ERROR", message: e?.message ?? MESSAGES.serverError, land: e?.details?.land },
    };
  } catch (err) {
    if (outer.aborted) return { kind: "aborted" }; // 새 요청을 시작해서 이전 요청을 취소한 경우
    if ((err as Error)?.name === "TimeoutError") return { kind: "error", error: { code: "TIMEOUT", message: MESSAGES.timeout } };
    return { kind: "error", error: { code: "NETWORK", message: MESSAGES.networkError } };
  }
}
