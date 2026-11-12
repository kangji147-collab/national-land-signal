// Design Ref: §4.3 — 기대효과 만들기 (순수 규칙: AI 호출 자체는 밖에서 함수로 받는다)
// PRD must2 규칙 6: 기대효과 문장표의 테마별 기본 문장을 바탕으로 AI가 "다듬기만" 하고, 표에 없는 새로운 숫자는 만들지 않는다.
//
// 안전 장치 (하나라도 걸리면 AI 결과를 버리고 문장표 기본 문장을 그대로 쓴다):
//   - AI가 JSON 모양이 아닌 답을 준 경우, 문장 수가 모자라거나 너무 많은 경우, 문장이 너무 긴 경우
//   - 기본 문장에 없는 숫자(0~9, 전각 숫자)가 나온 경우 / "수만 명"·"몇 퍼센트" 같은 수량 표현이 새로 나온 경우
//   - AI 호출이 실패하거나 시간이 지난 경우
// OpenAI로는 테마 이름·토지/건물 구분·문장표 문장만 보낸다. (주소·면적·사진·소유자 정보는 보내지 않는다)
import type { PropertyType } from "./types";

export const MIN_EFFECTS = 3;
export const MAX_EFFECTS = 6;
export const MAX_SENTENCE_LENGTH = 200;

export interface EffectResult {
  sentences: string[];
  /** ai: AI가 다듬은 문장 / table: 문장표 기본 문장 */
  source: "ai" | "table";
}

/** AI에게 보낼 글: 시스템 지시 + 사용자 내용 */
export interface PolishMessages {
  system: string;
  user: string;
}

export function buildPolishMessages(theme: string, type: PropertyType, base: readonly string[]): PolishMessages {
  const system = [
    "너는 국유재산 개발 제안서의 '기대효과' 문장을 다듬는 편집자야.",
    "주어진 기본 문장들의 뜻을 그대로 유지하면서 더 자연스럽고 읽기 쉬운 한국어 존댓말 문장으로만 고쳐 써.",
    "규칙:",
    "1. 새로운 숫자·통계·비율·금액·인원·기간·고유명사를 절대 만들어 내지 마. 기본 문장에 없는 숫자는 쓰지 마.",
    "2. 기본 문장에 없는 새로운 효과나 사실을 덧붙이지 마. 문장마다 기본 문장 1개를 다듬은 것이어야 해.",
    "3. 문장 수는 기본 문장 수와 같게, 문장 하나는 한두 줄(100자 이내)로 써.",
    '4. 반드시 {"effects": ["문장1", "문장2", ...]} 모양의 JSON 하나만 답해. 다른 글은 쓰지 마.',
  ].join("\n");
  const user = [
    `개발 테마: ${theme}`,
    `대상: ${type === "land" ? "토지" : "건물"}`,
    "기본 문장:",
    ...base.map((s, i) => `${i + 1}. ${s}`),
  ].join("\n");
  return { system, user };
}

const DIGIT = /[0-9０-９]+(?:[.,][0-9０-９]+)*/g;
// "수만 명", "몇 퍼센트", "백 곳" 같은 숫자 글자 수량 표현
const QUANTITY = /[일이삼사오육칠팔구십백천만억몇수]{1,3}\s?(?:퍼센트|%|명|원|배|개|곳|건|채|세대|가구|ha|㎡|평)/g;

function tokens(re: RegExp, text: string): string[] {
  return [...text.matchAll(new RegExp(re.source, "g"))].map((m) => m[0].replace(/\s/g, ""));
}

/** 기본 문장에 없는 숫자·수량 표현이 있으면 true */
export function hasNewNumber(text: string, base: readonly string[]): boolean {
  const joined = base.join(" ");
  const allowed = new Set([...tokens(DIGIT, joined), ...tokens(QUANTITY, joined)]);
  return [...tokens(DIGIT, text), ...tokens(QUANTITY, text)].some((t) => !allowed.has(t));
}

/** AI가 돌려준 글(JSON)을 검사한다. 통과하면 문장 목록, 하나라도 걸리면 null */
export function parsePolished(raw: string, base: readonly string[]): string[] | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const list = (json as { effects?: unknown } | null)?.effects;
  if (!Array.isArray(list) || list.length < MIN_EFFECTS || list.length > MAX_EFFECTS) return null;
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") return null;
    const s = item.trim();
    if (s === "" || s.length > MAX_SENTENCE_LENGTH) return null;
    if (hasNewNumber(s, base)) return null;
    out.push(s);
  }
  return out;
}

export interface MakeEffectsOptions {
  theme: string;
  type: PropertyType;
  /** 문장표의 기본 문장 (정렬 순서대로) */
  base: readonly string[];
  /** false 이면 AI를 부르지 않고 기본 문장을 쓴다 (오늘 시뮬레이션 횟수를 모두 쓴 경우) */
  aiAllowed: boolean;
  /** AI 호출 (글 → AI가 돌려준 글). 실패하면 던져도 된다 */
  polish: (messages: PolishMessages) => Promise<string>;
}

/** 기대효과 문장 만들기: 가능하면 AI가 다듬고, 아니면 문장표 기본 문장을 그대로 쓴다 */
export async function makeEffects(opts: MakeEffectsOptions): Promise<EffectResult> {
  const table: EffectResult = { sentences: [...opts.base], source: "table" };
  // 기본 문장이 3개 미만이면 다듬어서 늘릴 수 없다 (새 내용을 만들지 않으므로) → 표 그대로
  if (!opts.aiAllowed || opts.base.length < MIN_EFFECTS) return table;
  try {
    const raw = await opts.polish(buildPolishMessages(opts.theme, opts.type, opts.base));
    const polished = parsePolished(raw, opts.base);
    return polished ? { sentences: polished, source: "ai" } : table;
  } catch {
    // 실패 내용(키·문장)은 남기지 않는다
    console.error("기대효과 AI 다듬기에 실패해서 문장표 기본 문장을 써요");
    return table;
  }
}
