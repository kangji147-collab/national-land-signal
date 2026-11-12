// Design Ref: §3.5 — 판정 결과 화면에서 "무엇을 어떤 글로 보여줄지"를 정한다. (순수 규칙: 화면 없이 시험할 수 있다)
import { ANSWER_LABELS, QUESTIONS } from "@/lib/questions";
import type { Answer, Basis, QuestionKey, Signal } from "@/lib/types";

export interface SignalView {
  icon: string;
  /** 색을 구별하기 어려운 사람도 알 수 있도록 색과 함께 보여줄 글 */
  title: string;
  summary: string;
  /** 근거 목록의 제목 */
  reasonsTitle: string;
}

const VIEWS: Record<Signal, SignalView> = {
  green: {
    icon: "🟢",
    title: "매각 가능해요",
    summary: "확인한 내용으로는 매각을 검토할 수 있어요. 최종 매각 여부는 한국자산관리공사 심사로 결정돼요.",
    reasonsTitle: "확인한 내용",
  },
  yellow: {
    icon: "🟡",
    title: "담당자 상담이 필요해요",
    summary: "조건부로 가능할 수 있어서 담당자와 상담이 필요해요. 아래 이유를 함께 알려 주세요.",
    reasonsTitle: "상담이 필요한 이유",
  },
  red: {
    icon: "🔴",
    title: "내부 규정상 매각이 어려워요",
    summary: "아래 이유로 매각이 불가능한 재산으로 판정됐어요.",
    reasonsTitle: "매각이 어려운 이유",
  },
};

export function signalView(signal: Signal): SignalView {
  return VIEWS[signal];
}

/** 규칙표 기준 연도 표시: [2026] → "2026년", [2025, 2026] → "2025~2026년", 없으면 "" */
export function formatBaseYears(years: readonly number[]): string {
  if (years.length === 0) return "";
  const first = years[0];
  const last = years[years.length - 1];
  return first === last ? `${first}년` : `${first}~${last}년`;
}

const questionKeys = new Set<string>(QUESTIONS.map((q) => q.key));

/** 근거 한 줄을 화면에 보여줄 모양으로: 제목(어떤 항목) + 설명(왜) */
export function describeBasis(b: Basis): { title: string; detail: string } {
  if (b.kind === "질문") {
    // 이름은 "질문키:답"(예: onbid:no). 답을 안 한 경우에는 질문 키만 온다.
    const [key, answer] = b.name.split(":");
    if (questionKeys.has(key)) {
      const q = QUESTIONS.find((x) => x.key === key)!;
      const a = answer && answer in ANSWER_LABELS ? ANSWER_LABELS[answer as Answer] : "답 없음";
      return { title: q.text, detail: `답: ${a} — ${b.reason}` };
    }
  }
  return { title: `${b.kind}: ${b.name}`, detail: b.reason };
}

export type { QuestionKey };
