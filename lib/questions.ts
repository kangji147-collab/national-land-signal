// Design Ref: §3.4, §4.1 — 보완 질문 목록 (PRD must1 규칙 10)
// 질문마다 "예/아니오/모르겠음"으로 답하고, 답에 따른 신호는 규칙표('질문' 줄)가 정한다. (lib/judge.ts)
import type { Answer, PropertyType, QuestionKey } from "./types";

export interface Question {
  key: QuestionKey;
  /** 화면에 그대로 보여주는 질문 (PRD 원문) */
  text: string;
  /** 답하는 데 도움이 되는 한 줄 설명 */
  hint?: string;
  buildingOnly?: boolean;
}

export const QUESTIONS: readonly Question[] = [
  {
    key: "onbid",
    text: "온비드 등에서 국유재산으로 확인한 곳인가요?", // PRD 필수 질문
    hint: "온비드 등 공식 사이트에서 국유재산(일반재산)으로 확인했다면 '예'를 골라 주세요.",
  },
  { key: "dispute", text: "소송·분쟁 중인 곳인가요?" },
  { key: "inUse", text: "현재 누군가 사용(점유)하고 있나요?" },
  {
    key: "safety",
    text: "최근 안전진단에서 위험(D·E등급) 판정을 받았나요?",
    hint: "위험 판정을 받은 것을 알면 '예', 받은 적 없다고 확실하면 '아니오'를 골라 주세요.",
    buildingOnly: true,
  },
];

export const ANSWER_ORDER: readonly Answer[] = ["yes", "no", "unknown"];
export const ANSWER_LABELS: Record<Answer, string> = { yes: "예", no: "아니오", unknown: "모르겠음" };

/** 진단 종류에 따라 물어야 하는 질문 (토지 3개, 건물 4개) */
export function questionsFor(type: PropertyType): Question[] {
  return QUESTIONS.filter((q) => !q.buildingOnly || type === "building");
}

export function questionText(key: QuestionKey): string {
  return QUESTIONS.find((q) => q.key === key)?.text ?? key;
}

type Answers = Partial<Record<QuestionKey, Answer | null | undefined>>;

const isAnswer = (v: unknown): v is Answer => v === "yes" || v === "no" || v === "unknown";

/** 아직 답하지 않은 질문 (비었거나 "예/아니오/모르겠음"이 아닌 값도 답하지 않은 것으로 본다) */
export function unansweredQuestions(type: PropertyType, answers: Answers): Question[] {
  return questionsFor(type).filter((q) => !isAnswer(answers[q.key]));
}

/** 모든 질문에 답했는지 — 그래야 "판정하기"를 누를 수 있다 (PRD: 서류에 없는 사항은 질문으로 묻는다) */
export function isAllAnswered(type: PropertyType, answers: Answers): boolean {
  return unansweredQuestions(type, answers).length === 0;
}
