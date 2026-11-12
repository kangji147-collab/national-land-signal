// 다른 사이트가 방문자의 브라우저로 우리 API 를 몰래 부르는 것을 막는다. (보안 점검 SEC-002, CSRF)
// 브라우저는 요청에 출처 정보(Sec-Fetch-Site, Origin)를 항상 붙이고 사이트가 고칠 수 없다.
//  - Sec-Fetch-Site 가 same-origin(우리 화면) 또는 none(주소창 직접 입력)이 아니면 거절
//  - Origin 이 있는데 우리 주소와 다르면 거절
//  - 둘 다 없으면(서버끼리 호출·시험·curl) 브라우저가 아니므로 통과 — 이 경우는 CSRF 위험이 없다.
import { fail } from "./api-response";

/** 다른 사이트에서 온 브라우저 요청이면 거절 응답을, 아니면 null 을 돌려준다 */
export function rejectCrossSite(request: Request): Response | null {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return forbidden();

  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return forbidden(); // "null" 같은 이상한 출처
    }
    if (originHost !== host.split(",")[0].trim()) return forbidden();
  }
  return null;
}

function forbidden(): Response {
  return fail("FORBIDDEN_ORIGIN", "허용되지 않은 접근이에요");
}
