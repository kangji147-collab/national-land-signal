// Design Ref: §6 — GET /api/layout-items?theme=공영주차장 : 배치 시뮬레이터에서 끌어다 놓을 시설물 목록. (횟수에 넣지 않음)
// 시설물 표(Supabase)에서 요청마다 새로 읽는다. 이 목록은 화면에 보여줄 후보일 뿐이고,
// 제안서를 만들 때 서버가 이름·개수·면적을 이 표로 다시 확인한다.
import { z } from "zod";
import { fail, ok, serverError } from "@/lib/api-response";
import { fetchLayoutItems } from "@/lib/rules-source";
import { rejectCrossSite } from "@/lib/same-origin";
import { createAnonClient } from "@/lib/supabase";
import { themeTarget } from "@/lib/themes";

const Query = z.object({ theme: z.string().min(1).max(30) });

export async function GET(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  // request.url 을 읽으므로 요청 때마다 실행된다 (캐시되지 않음)
  const parsed = Query.safeParse({ theme: new URL(request.url).searchParams.get("theme") ?? "" });
  // 배치는 토지 테마에서만 쓴다 (건물 테마는 연면적 기준 계산이라 해당 없음)
  if (!parsed.success || themeTarget(parsed.data.theme) !== "land") return fail("VALIDATION_ERROR", "입력한 내용을 다시 확인해 주세요");

  try {
    const items = await fetchLayoutItems(createAnonClient(), parsed.data.theme);
    return ok({ items });
  } catch {
    console.error("/api/layout-items 처리 중 오류"); // 표 내용·키는 남기지 않는다
    return serverError();
  }
}
