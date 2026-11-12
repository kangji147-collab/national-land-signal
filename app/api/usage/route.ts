// Design Ref: §6 — GET /api/usage: 오늘 남은 횟수 (화면 표시용, 횟수를 깎지 않음)
import { ok, serverError } from "@/lib/api-response";
import { createSupabaseUsageStore, getClientIp, getUsageSummary } from "@/lib/usage-limit";

export async function GET(request: Request) {
  try {
    // request.headers 를 읽으므로 요청 때마다 실행된다 (캐시되지 않음)
    const ip = getClientIp(request.headers);
    const summary = await getUsageSummary(createSupabaseUsageStore(), ip);
    return ok(summary);
  } catch {
    // 주소·키 같은 값이 새지 않게 내용은 로그·응답에 남기지 않는다
    console.error("/api/usage 처리 중 오류");
    return serverError();
  }
}
