// 보완 질문 규칙 시험 (lib/questions.ts): PRD must 1 규칙 10 — 질문 3~5개, 필수 질문 포함, 건물이면 안전진단 질문 추가
import { describe, expect, it } from "vitest";
import {
  ANSWER_LABELS,
  ANSWER_ORDER,
  QUESTIONS,
  isAllAnswered,
  questionText,
  questionsFor,
  unansweredQuestions,
} from "../lib/questions";

describe("질문 목록 (PRD 규칙 10)", () => {
  it("토지는 3개, 건물은 4개 (3~5개 범위)", () => {
    expect(questionsFor("land")).toHaveLength(3);
    expect(questionsFor("building")).toHaveLength(4);
  });

  it("국유재산 확인 질문이 맨 앞에 있고 PRD 원문 그대로다 (필수 질문)", () => {
    for (const type of ["land", "building"] as const) {
      expect(questionsFor(type)[0]).toMatchObject({ key: "onbid", text: "온비드 등에서 국유재산으로 확인한 곳인가요?" });
    }
  });

  it("안전진단 질문은 건물에만 있다", () => {
    expect(questionsFor("land").map((q) => q.key)).toEqual(["onbid", "dispute", "inUse"]);
    expect(questionsFor("building").map((q) => q.key)).toEqual(["onbid", "dispute", "inUse", "safety"]);
  });

  it("질문 키는 겹치지 않고, 모든 질문에 글이 있다", () => {
    const keys = QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(QUESTIONS.every((q) => q.text.length > 0)).toBe(true);
  });

  it("키로 질문 글을 찾는다", () => {
    expect(questionText("dispute")).toBe("소송·분쟁 중인 곳인가요?");
  });

  it("답은 예/아니오/모르겠음 세 가지이고 화면 글자가 정해져 있다", () => {
    expect(ANSWER_ORDER).toEqual(["yes", "no", "unknown"]);
    expect(ANSWER_LABELS).toEqual({ yes: "예", no: "아니오", unknown: "모르겠음" });
  });
});

describe("모두 답했는지 (이래야 '판정하기'를 누를 수 있다)", () => {
  const all = { onbid: "yes", dispute: "no", inUse: "no", safety: "no" } as const;

  it("아무것도 답하지 않으면 모든 질문이 남아 있다", () => {
    expect(unansweredQuestions("land", {}).map((q) => q.key)).toEqual(["onbid", "dispute", "inUse"]);
    expect(isAllAnswered("land", {})).toBe(false);
  });

  it("일부만 답하면 남은 질문만 돌려준다", () => {
    expect(unansweredQuestions("land", { onbid: "yes", inUse: "unknown" }).map((q) => q.key)).toEqual(["dispute"]);
  });

  it("'모르겠음'도 답한 것이다 (판정에서 노란불로 처리될 뿐)", () => {
    expect(isAllAnswered("land", { onbid: "unknown", dispute: "unknown", inUse: "unknown" })).toBe(true);
  });

  it("토지는 안전진단 질문에 답하지 않아도 된다, 건물은 답해야 한다", () => {
    const { safety, ...landOnly } = all;
    void safety;
    expect(isAllAnswered("land", landOnly)).toBe(true);
    expect(isAllAnswered("building", landOnly)).toBe(false);
    expect(isAllAnswered("building", all)).toBe(true);
  });

  it("null·undefined·이상한 값은 답하지 않은 것으로 본다 (규칙표에 없는 답이 판정에 들어가지 않게)", () => {
    expect(isAllAnswered("land", { onbid: null, dispute: "no", inUse: "no" })).toBe(false);
    expect(isAllAnswered("land", { onbid: undefined, dispute: "no", inUse: "no" })).toBe(false);
    expect(isAllAnswered("land", { onbid: "maybe" as never, dispute: "no", inUse: "no" })).toBe(false);
    expect(isAllAnswered("land", { onbid: "" as never, dispute: "no", inUse: "no" })).toBe(false);
  });

  it("해당하지 않는 질문의 답은 무시한다 (토지인데 안전진단 답이 남아 있어도)", () => {
    expect(isAllAnswered("land", { onbid: "yes", dispute: "no", inUse: "no", safety: "yes" })).toBe(true);
    expect(isAllAnswered("land", { onbid: "yes", dispute: "no" })).toBe(false);
  });
});
