// Design Ref: §6 — POST /api/proposal : 예상 수익·예상 매수 가격·노후 여부를 계산해 돌려준다. (횟수에 넣지 않음)
// 서버가 먼저 다시 확인한다 (민원인이 브라우저에서 값을 바꿔 보내도 소용없게):
//   1) 규칙표로 다시 판정해 🟢가 아니면 거절(NOT_GREEN)  2) 테마 허용표에 없는 테마면 거절(THEME_NOT_ALLOWED)
// 숫자는 AI가 아니라 lib/calc.ts 가 단가표·공시지가로 계산한다. 단가표는 요청마다 새로 읽는다.
// 개인정보: 받은 값은 계산에만 쓰고 저장하지 않으며, 로그에도 남기지 않는다.
// 기대효과(작업 19번): 문장표 기본 문장을 AI가 다듬기만 한다. 오늘 시뮬레이션 횟수가 0이면 AI 없이 기본 문장,
//   AI 실패·새 숫자 감지 때도 기본 문장을 쓴다. (이 API는 횟수를 차감하지 않는다)
import { type CalcInput, calcIncome, calcPurchasePrice, isOldBuilding } from "@/lib/calc";
import { makeEffects } from "@/lib/effects";
import { polishText } from "@/lib/openai";
import { createSupabaseUsageStore, getClientIp, getUsageSummary } from "@/lib/usage-limit";
import { fail, ok, serverError } from "@/lib/api-response";
import { judge } from "@/lib/judge";
import { toJudgeInput } from "@/lib/judge-schema";
import { MESSAGES } from "@/lib/messages";
import { ProposalRequestSchema } from "@/lib/proposal-schema";
import { toCalcEdited } from "@/lib/review";
import { fetchAllowedThemes, fetchEffectSentences, fetchPrices, fetchRules } from "@/lib/rules-source";
import { createAnonClient } from "@/lib/supabase";
import { withPolishCache } from "@/lib/polish-cache";
import { rejectCrossSite } from "@/lib/same-origin";

// 서버가 켜져 있는 동안 기억한다 (요청마다 새로 만들지 않는다)
const cachedPolish = withPolishCache((m) => polishText(m));

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  const json = await request.json().catch(() => null);
  const parsed = ProposalRequestSchema.safeParse(json);
  if (!parsed.success) return fail("VALIDATION_ERROR", "입력한 내용을 다시 확인해 주세요");
  const req = parsed.data;

  try {
    const client = createAnonClient();

    // 1) 🟢인지 다시 확인
    const result = judge(toJudgeInput(req), await fetchRules(client));
    if (result.signal !== "green") {
      return fail("NOT_GREEN", "개발 제안서는 매각이 가능한 곳(🟢)에서만 만들 수 있어요");
    }

    // 2) 이 용도지역에서 허용된 테마인지 다시 확인
    const allowed = await fetchAllowedThemes(client, req.type, req.zone);
    if (!(allowed as readonly string[]).includes(req.theme)) {
      return fail("THEME_NOT_ALLOWED", "이 용도지역에서는 고를 수 없는 테마예요");
    }

    // 3) 단가표·공시지가로 계산 (계산할 수 없는 값은 이유와 함께 "계산 불가"로 돌려준다)
    const prices = await fetchPrices(client);
    const input: CalcInput = {
      type: req.type,
      theme: req.theme,
      landArea: req.area,
      officialPrice: req.officialPrice ?? Number.NaN,
      totalFloorArea: req.totalFloorArea,
      buildingStandardValue: req.buildingStandardValue,
      edited: toCalcEdited(req.edited),
    };
    const income = calcIncome(input, prices);
    const price = req.officialPrice === null
      ? ({ ok: false, code: "INVALID_INPUT", message: "개별공시지가를 알 수 없어 예상 매수 가격을 계산할 수 없어요" } as const)
      : calcPurchasePrice(input);

    // 4) 기대효과: 문장표 기본 문장 + (남은 횟수가 있을 때만) AI 다듬기
    const base = await fetchEffectSentences(client, req.theme);
    const effects = await makeEffects({
      theme: req.theme,
      type: req.type,
      base,
      aiAllowed: await hasSimulationLeft(request),
      polish: cachedPolish, // 같은 글이면 OpenAI 를 다시 부르지 않는다 (비용 남용 방지)
    });

    return ok({
      theme: req.theme,
      income,
      price,
      effects,
      // 건물만: 사용승인일 30년 이상이면 안내 (모르면 unknown → 화면이 "사용승인일 확인 필요")
      oldBuilding: req.type === "building" ? isOldBuilding(req.approvalDate) : null,
      notices: { income: MESSAGES.incomeNotice, price: MESSAGES.priceNotice },
    });
  } catch {
    console.error("/api/proposal 처리 중 오류"); // 표 내용·입력 값은 남기지 않는다
    return serverError();
  }
}

/** 오늘 시뮬레이션 남은 횟수가 있는지 (읽기만, 차감 없음). 확인하지 못하면 AI를 쓰지 않는 쪽(false)으로 */
async function hasSimulationLeft(request: Request): Promise<boolean> {
  try {
    const summary = await getUsageSummary(createSupabaseUsageStore(), getClientIp(request.headers));
    return summary.simulate.remaining > 0;
  } catch {
    console.error("/api/proposal 남은 횟수 확인 실패 — AI 없이 진행"); // 주소·키는 남기지 않는다
    return false;
  }
}
