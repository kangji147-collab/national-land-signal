// Design Ref: §4.1 — 판정 규칙이 주고받는 값의 모양 (화면·서버 공통)

export type Signal = "green" | "yellow" | "red";
export type PropertyType = "land" | "building";
export type Answer = "yes" | "no" | "unknown";
export type RuleCategory = "지목" | "용도지역" | "지역지구" | "질문";

/** 규칙표(Supabase `rules`) 한 줄 */
export interface RuleRow {
  category: RuleCategory;
  name: string; // 질문은 "질문키:답" (예: onbid:no)
  signal: Signal;
  reason: string;
  base_year: number;
}

/** 보완 질문 키 */
export type QuestionKey = "onbid" | "dispute" | "inUse" | "safety";

/** 판정에 넣는 값 (민원인이 확인·수정한 값) */
export interface JudgeInput {
  type: PropertyType;
  landCategory: string; // 지목
  zone: string; // 용도지역
  otherZones: string[]; // 다른 법령 지역·지구 (괄호·법령 이름이 붙은 원문이어도 됨)
  answers: Partial<Record<QuestionKey, Answer | null>>;
}

/** 판정 근거 한 줄 */
export interface Basis {
  kind: RuleCategory;
  name: string;
  signal: Signal;
  reason: string;
  baseYear?: number; // 규칙표에서 찾은 줄만 있음
}

export interface JudgeResult {
  signal: Signal;
  /** 화면에 보여줄 근거: 🔴면 🔴 항목, 🟡면 🟡 항목, 🟢면 확인한 항목 전체 */
  reasons: Basis[];
  /** 확인한 항목 전체 */
  checked: Basis[];
  /** 판정에 쓴 규칙표 줄들의 기준 연도 (오름차순, 중복 없음) */
  baseYears: number[];
}
