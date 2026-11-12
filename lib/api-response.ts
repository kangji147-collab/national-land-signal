// Design Ref: §6 — 서버 API 응답 모양을 한곳에서 통일한다.
//   성공: { "data": ... }   오류: { "error": { "code": "...", "message": "민원인에게 보여줄 문장" } }
import { MESSAGES } from "./messages";

/** 오류 코드와 HTTP 상태 (DESIGN §6) */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400, // 입력 모양 틀림
  INVALID_FILE: 400, // 사진 형식·용량
  ADDRESS_NOT_FOUND: 404, // 주소 없음
  LAND_INFO_NOT_FOUND: 404, // 소재지·면적을 못 가져옴
  NO_BUILDING_REGISTER: 404, // 건축물대장 없음
  NOT_GREEN: 403, // 🟢 아님
  THEME_NOT_ALLOWED: 403, // 허용되지 않은 테마
  LIMIT_EXCEEDED: 429, // 횟수 소진
  UPSTREAM_FAILED: 502, // 공공 API 오류·시간 초과 (횟수 반환)
  AI_FAILED: 502, // 이미지·문장 생성 실패 (횟수 반환)
  SERVER_ERROR: 500,
} as const;

export type ApiErrorCode = keyof typeof ERROR_STATUS;

// 횟수·개인별 값이 들어가는 응답은 캐시하지 않는다.
const NO_STORE = { "Cache-Control": "no-store" };

export function ok<T>(data: T): Response {
  return Response.json({ data }, { headers: NO_STORE });
}

/**
 * 오류 응답. details 는 화면이 오류 뒤에 이어서 쓸 수 있는 값이다.
 * 예) 건축물대장이 없을 때 이미 가져온 토지 정보를 함께 돌려줘서, 토지 진단으로 이어갈 때 조회 횟수를 또 쓰지 않게 한다.
 */
export function fail(code: ApiErrorCode, message: string, details?: Record<string, unknown>): Response {
  return Response.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status: ERROR_STATUS[code], headers: NO_STORE },
  );
}

/** 예상하지 못한 오류: 내용은 밖으로 보내지 않고 일반 문구만 돌려준다. (주소·키 등이 새지 않게) */
export function serverError(): Response {
  return fail("SERVER_ERROR", MESSAGES.serverError);
}
