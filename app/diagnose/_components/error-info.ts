// Design Ref: §3.2, §6 — 오류 종류별로 화면에서 어떻게 안내할지 정한다. (순수 규칙: 화면 없이 시험할 수 있다)
// Plan SC: PRD must 1 규칙 5·6 — 주소·정보를 못 찾으면 멈추고 안내, 공공 API 오류는 "다시 시도" 안내(횟수 차감 없음)

/** 화면 쪽에서만 쓰는 오류 코드 (서버가 아니라 브라우저가 알아챈 경우) */
export type ClientErrorCode = "NETWORK" | "TIMEOUT";

export interface ErrorInfo {
  /** 오류 문구 아래에 덧붙일 도움말 (없으면 null) */
  hint: string | null;
  /** "다시 시도" 버튼을 보여줄지 — 잠시 뒤 다시 해 보면 될 수 있는 경우 */
  retryable: boolean;
  /** 오늘 횟수를 모두 쓴 경우 — 내일까지 해당 버튼을 막는다 */
  exhausted: boolean;
}

const RETRYABLE = new Set(["UPSTREAM_FAILED", "SERVER_ERROR", "AI_FAILED", "NETWORK", "TIMEOUT"]);

const HINTS: Record<string, string> = {
  ADDRESS_NOT_FOUND: "시·구·동까지 함께 적거나, 지번 대신 도로명(또는 도로명 대신 지번)으로 다시 검색해 보세요.",
  LAND_INFO_NOT_FOUND: "다른 필지를 골라 보거나, 주소를 다시 검색해 주세요.",
  NO_BUILDING_REGISTER: "건물이 없는 땅이라면 아래 버튼으로 토지 진단을 이어갈 수 있어요. (오늘 조회 횟수는 더 쓰지 않아요)",
};

const RETRY_HINT = "실패한 조회는 오늘 횟수에서 차감되지 않아요.";
// 브라우저가 기다리다 멈춘 경우: 서버는 이미 처리를 끝냈을 수 있어서 횟수가 사용됐을 수 있다 (정직하게 안내)
const WAIT_STOPPED_HINT = "응답을 기다리다 멈춘 경우에는 서버가 이미 처리해 횟수가 사용됐을 수 있어요.";

export function describeError(code: string): ErrorInfo {
  const retryable = RETRYABLE.has(code);
  const retryHint = code === "NETWORK" || code === "TIMEOUT" ? WAIT_STOPPED_HINT : RETRY_HINT;
  return {
    hint: HINTS[code] ?? (retryable ? retryHint : null),
    retryable,
    exhausted: code === "LIMIT_EXCEEDED",
  };
}
