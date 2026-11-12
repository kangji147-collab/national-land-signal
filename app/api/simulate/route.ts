// Design Ref: §6, §4.3 — POST /api/simulate : 현장 사진 + 테마로 "개발 후 모습" 이미지를 만든다. (시뮬레이션 하루 5회)
// 요청: multipart/form-data — photo(줄인 사진 1장) + meta(JSON 글자: 확인한 항목·질문 답·테마)
// 순서: 입력 검사 → 🟢 다시 판정(NOT_GREEN) → 허용 테마 다시 확인(THEME_NOT_ALLOWED) → 횟수 먼저 잡기 → 이미지 만들기
//       → 만들기에 실패하면 잡아 둔 횟수를 돌려준다(AI_FAILED).
// 개인정보: 사진·값은 이미지 만들기에만 쓰고 저장하지 않으며, 로그에도 남기지 않는다. OpenAI로는 사진과 요청 글만 보낸다.
import { fail, ok, serverError } from "@/lib/api-response";
import { detectImageType } from "@/lib/compress-image";
import { judge } from "@/lib/judge";
import { toJudgeInput } from "@/lib/judge-schema";
import { simulateImage } from "@/lib/openai";
import { SimulateMetaSchema } from "@/lib/proposal-schema";
import { rejectCrossSite } from "@/lib/same-origin";
import { fetchAllowedThemes, fetchRules } from "@/lib/rules-source";
import { buildSimulatePrompt } from "@/lib/simulate-prompt";
import { createAnonClient } from "@/lib/supabase";
import { createSupabaseUsageStore, getClientIp, getUsageSummary, runWithUsage } from "@/lib/usage-limit";

// 이미지 만들기는 오래 걸릴 수 있다 (Next.js 문서 확인 완료)
export const maxDuration = 120;

/** 서버가 받는 사진 최대 크기. 브라우저가 약 2MB로 줄여 보내므로 넉넉히 4MB (Vercel 요청 한도 4.5MB 이내) */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

const AI_FAILED_MESSAGE = "시뮬레이션 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요";

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request); // 다른 사이트가 방문자 브라우저로 몰래 부르는 것을 막는다
  if (blocked) return blocked;
  const form = await request.formData().catch(() => null);
  if (!form) return fail("VALIDATION_ERROR", "입력한 내용을 다시 확인해 주세요");

  // 1) 입력 검사 (여기서 걸리면 횟수를 쓰지 않는다)
  const file = form.get("photo");
  const metaText = form.get("meta");
  if (!(file instanceof Blob) || typeof metaText !== "string") {
    return fail("VALIDATION_ERROR", "입력한 내용을 다시 확인해 주세요");
  }
  let metaJson: unknown;
  try {
    metaJson = JSON.parse(metaText);
  } catch {
    return fail("VALIDATION_ERROR", "입력한 내용을 다시 확인해 주세요");
  }
  const meta = SimulateMetaSchema.safeParse(metaJson);
  if (!meta.success) return fail("VALIDATION_ERROR", "입력한 내용을 다시 확인해 주세요");
  const req = meta.data;

  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    return fail("INVALID_FILE", "사진이 너무 크거나 비어 있어요. 다른 사진을 골라 주세요");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes.subarray(0, 16)); // 이름·MIME 은 믿지 않고 파일 앞부분으로 확인
  if (!type) return fail("INVALID_FILE", "jpg 또는 png 사진만 올릴 수 있어요");

  const prompt = buildSimulatePrompt(req.theme, req.type);
  if (!prompt) return fail("THEME_NOT_ALLOWED", "이 용도지역에서는 고를 수 없는 테마예요");

  try {
    const client = createAnonClient();

    // 2) 🟢인지 다시 확인
    const result = judge(toJudgeInput(req), await fetchRules(client));
    if (result.signal !== "green") {
      return fail("NOT_GREEN", "개발 제안서는 매각이 가능한 곳(🟢)에서만 만들 수 있어요");
    }

    // 3) 이 용도지역에서 허용된 테마인지 다시 확인
    const allowed = await fetchAllowedThemes(client, req.type, req.zone);
    if (!(allowed as readonly string[]).includes(req.theme)) {
      return fail("THEME_NOT_ALLOWED", "이 용도지역에서는 고를 수 없는 테마예요");
    }

    // 4) 횟수를 먼저 잡고 이미지를 만든다. 만들기에 실패하면 runWithUsage 가 횟수를 돌려준다.
    const store = createSupabaseUsageStore();
    const ip = getClientIp(request.headers);
    let imageFailed = false;
    let image;
    try {
      const run = await runWithUsage(store, "simulate", ip, async () => {
        try {
          return await simulateImage({ bytes, mime: type === "png" ? "image/png" : "image/jpeg" }, prompt);
        } catch (e) {
          imageFailed = true; // 횟수 잡기(DB) 오류와 구분한다
          throw e;
        }
      });
      if (!run.ok) return fail("LIMIT_EXCEEDED", run.message);
      image = run.value;
    } catch (e) {
      if (!imageFailed) throw e; // 횟수를 잡지 못한 DB 오류 등 → 아래 바깥 catch 가 일반 오류로 처리
      // AI 오류·시간 초과·검열 거절 등. 내용(사진·키·요청 글)은 남기지 않는다.
      console.error("/api/simulate 이미지 만들기 실패 — 횟수를 돌려줬어요");
      return fail("AI_FAILED", AI_FAILED_MESSAGE);
    }

    // 화면 표시용 남은 횟수 (확인하지 못해도 이미지는 돌려준다)
    const remaining = await getUsageSummary(store, ip).then((s) => s.simulate.remaining).catch(() => null);
    return ok({ image: `data:${image.mime};base64,${image.base64}`, remaining });
  } catch {
    console.error("/api/simulate 처리 중 오류"); // 표 내용·키·사진은 남기지 않는다
    return serverError();
  }
}
