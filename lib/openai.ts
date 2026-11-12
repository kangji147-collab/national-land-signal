// Design Ref: §7 — OpenAI 연결 (서버 전용: 이 파일은 app/api/ 서버 코드에서만 불러온다)
// 키(OPENAI_API_KEY)는 .env 에서 읽고, 값은 어디에도 출력하지 않는다. NEXT_PUBLIC_ 을 붙이지 않는다.
// 기대효과 문장 다듬기(글, 작업 19번)와 시뮬레이션 이미지 편집(작업 20번)에 쓴다.
import OpenAI, { toFile } from "openai";
import type { PolishMessages } from "./effects";

/** 문장 다듬기에 쓰는 모델. 환경 변수 OPENAI_TEXT_MODEL 로 바꿀 수 있다 (작고 값싼 모델이면 충분) */
export const DEFAULT_TEXT_MODEL = "gpt-5.4-mini";

/** AI 호출 한 번에 기다리는 최대 시간(ms). 넘으면 문장표 기본 문장을 쓴다 */
export const POLISH_TIMEOUT_MS = 12_000;

function createClient(timeoutMs: number): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("환경 변수 OPENAI_API_KEY 값이 없어요"); // 값은 메시지에 넣지 않는다
  // 재시도는 하지 않는다 (실패하면 바로 문장표 기본 문장으로 대신하므로)
  return new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 0 });
}

/** 글 다듬기 요청 → AI가 돌려준 글(JSON 글자). 실패하면 던진다 */
export async function polishText(messages: PolishMessages, timeoutMs: number = POLISH_TIMEOUT_MS): Promise<string> {
  const res = await createClient(timeoutMs).chat.completions.create({
    model: process.env.OPENAI_TEXT_MODEL || DEFAULT_TEXT_MODEL,
    messages: [
      { role: "system", content: messages.system },
      { role: "user", content: messages.user },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2000, // 생각 토큰까지 포함한 상한
  });
  return res.choices[0]?.message?.content ?? "";
}

/** 시뮬레이션 이미지에 쓰는 모델. 환경 변수 OPENAI_IMAGE_MODEL 로 바꿀 수 있다 */
export const DEFAULT_IMAGE_MODEL = "gpt-image-2";

/** 이미지 만들기를 기다리는 최대 시간(ms). /api/simulate 의 maxDuration(120초)보다 짧게 */
export const IMAGE_TIMEOUT_MS = 100_000;

export interface SimulatedImage {
  /** JPEG 바이트를 base64 로 바꾼 글자 */
  base64: string;
  mime: "image/jpeg";
}

/**
 * 현장 사진 + 요청 글 → 개발 후 모습 이미지(JPEG). 사진 구도를 유지하도록 이미지 "편집" 기능을 쓴다.
 * 실패하면 던진다. (사진·요청 글·키는 오류 메시지·로그에 남기지 않는다)
 */
export async function simulateImage(photo: { bytes: Uint8Array; mime: "image/jpeg" | "image/png" }, prompt: string, timeoutMs: number = IMAGE_TIMEOUT_MS): Promise<SimulatedImage> {
  const ext = photo.mime === "image/png" ? "png" : "jpg";
  const file = await toFile(photo.bytes, `site.${ext}`, { type: photo.mime });
  const res = await createClient(timeoutMs).images.edit({
    model: process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    image: file,
    prompt,
    n: 1,
    quality: "medium", // 비용과 품질의 균형
    output_format: "jpeg",
    output_compression: 85, // 응답 4MB 이하로 유지
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("이미지 응답이 비어 있어요");
  return { base64: b64, mime: "image/jpeg" };
}
