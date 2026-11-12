// Design Ref: §6, §4.1 — POST /api/judge : 민원인이 확인·수정한 값과 질문 답을 규칙표로 판정한다. (횟수에 넣지 않음)
// 판정은 서버에서 한다 → 민원인이 브라우저에서 규칙표를 바꿔치기할 수 없다. (DESIGN §4 포인트)
//  - 규칙표·상담 연락처는 요청마다 Supabase 에서 새로 읽는다. (캐시하지 않아 관리자가 고친 내용이 바로 반영됨)
//  - 표를 읽지 못하면 판정하지 않고 오류를 돌려준다. (빈 규칙으로 판정하지 않음)
// 개인정보: 받은 값은 판정에만 쓰고 저장하지 않으며, 로그에도 남기지 않는다.
import { fail, ok, serverError } from "@/lib/api-response";
import { judge } from "@/lib/judge";
import { JudgeRequestSchema, toJudgeInput } from "@/lib/judge-schema";
import { fetchContact, fetchRules } from "@/lib/rules-source";
import { createAnonClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = JudgeRequestSchema.safeParse(json);
  if (!parsed.success) return fail("VALIDATION_ERROR", "입력한 내용을 다시 확인해 주세요");

  try {
    const client = createAnonClient();
    const rules = await fetchRules(client);
    const result = judge(toJudgeInput(parsed.data), rules);
    // 상담 연락처는 🟡일 때만 필요하다 (PRD 규칙 12)
    const contact = result.signal === "yellow" ? await fetchContact(client) : null;

    return ok({ signal: result.signal, reasons: result.reasons, baseYears: result.baseYears, contact });
  } catch {
    // 표를 읽지 못한 경우를 포함해, 내용(키·표 값)은 로그·응답에 남기지 않는다
    console.error("/api/judge 처리 중 오류");
    return serverError();
  }
}
