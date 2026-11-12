// Design Ref: §6 — GET /api/themes?type=land|building&zone=용도지역 : 그 용도지역에서 고를 수 있는 테마 목록. (횟수에 넣지 않음)
// 테마 허용표(Supabase)에 있는 것만 돌려준다. 요청마다 새로 읽어서 관리자가 고친 내용이 바로 반영된다.
// 이 목록은 "화면에 보여줄 후보"일 뿐이다. 시뮬레이션·제안서를 만들 때 서버가 🟢인지·허용 테마인지 다시 확인한다.
import { z } from "zod";
import { fail, ok, serverError } from "@/lib/api-response";
import { fetchAllowedThemes } from "@/lib/rules-source";
import { rejectCrossSite } from "@/lib/same-origin";
import { createAnonClient } from "@/lib/supabase";

const Query = z.object({ type: z.enum(["land", "building"]), zone: z.string().max(50) });

export async function GET(request: Request) {
  const blocked = rejectCrossSite(request); // 다른 사이트에서 몰래 부르는 요청 거절 (SEC-002)
  if (blocked) return blocked;
  // request.url 을 읽으므로 요청 때마다 실행된다 (캐시되지 않음)
  const sp = new URL(request.url).searchParams;
  const parsed = Query.safeParse({ type: sp.get("type") ?? "", zone: sp.get("zone") ?? "" });
  if (!parsed.success) return fail("VALIDATION_ERROR", "입력한 내용을 다시 확인해 주세요");

  try {
    const themes = await fetchAllowedThemes(createAnonClient(), parsed.data.type, parsed.data.zone);
    return ok({ themes });
  } catch {
    console.error("/api/themes 처리 중 오류"); // 표 내용·키는 남기지 않는다
    return serverError();
  }
}
