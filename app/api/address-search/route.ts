// Design Ref: §6, §4.3 — GET /api/address-search?q=주소 : 주소로 필지 후보를 찾는다.
// 주소 검색은 접속 주소당 하루 100회로 제한한다 (공공 API 호출 한도가 닳는 것을 막기 위함, 사용자 결정 2026-11-12).
//
// 횟수 규칙 (정보 가져오기의 20회와 별개로 센다)
//  - 입력이 잘못됐으면 횟수를 잡기 전에 거절한다. (400)
//  - 한도에 도달했으면 공공 API를 부르지 않고 거절한다. (429)
//  - 공공 API 오류·시간 초과는 던져진 오류라서 잡아 둔 1회가 돌아온다. (502)
//  - 정상 응답인데 결과가 없는 경우(404)는 값으로 돌려주므로 차감이 유지된다.
//  - 횟수 저장소(DB)가 고장 나면 검색하지 않는다. (500, 닫는 쪽으로 실패)
// 개인정보: 입력한 주소는 조회에만 쓰고 저장하지 않으며, 로그에도 남기지 않는다.
import { z } from "zod";
import { fail, ok, serverError } from "@/lib/api-response";
import { MESSAGES } from "@/lib/messages";
import { UpstreamError, searchAddress } from "@/lib/public-api";
import { rejectCrossSite } from "@/lib/same-origin";
import { createSupabaseUsageStore, getClientIp, runWithUsage } from "@/lib/usage-limit";

// 주소는 2~100자 (DESIGN §8)
const Query = z.object({ q: z.string().trim().min(2).max(100) });

export async function GET(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  // request.url 을 읽으므로 요청 때마다 실행된다 (캐시되지 않음)
  const parsed = Query.safeParse({ q: new URL(request.url).searchParams.get("q") ?? "" });
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "주소를 2글자 이상 100글자 이하로 입력해 주세요");
  }

  try {
    const ip = getClientIp(request.headers);
    const result = await runWithUsage(createSupabaseUsageStore(), "search", ip, () => searchAddress(parsed.data.q));

    if (!result.ok) return fail("LIMIT_EXCEEDED", result.message);
    if (result.value.candidates.length === 0) return fail("ADDRESS_NOT_FOUND", MESSAGES.addressNotFound);
    return ok(result.value);
  } catch (error) {
    if (error instanceof UpstreamError) {
      console.error("/api/address-search 공공 API 오류"); // 입력한 주소·키는 남기지 않는다
      return fail("UPSTREAM_FAILED", MESSAGES.upstreamFailed);
    }
    console.error("/api/address-search 처리 중 오류");
    return serverError();
  }
}
