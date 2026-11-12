"use client";
// Design Ref: §3.4 — ③ 보완 질문
// 공공 정보에 나오지 않는 사항을 질문 3~4개(예/아니오/모르겠음)로 묻는다. (PRD must 1 규칙 10)
// 질문 목록과 "모두 답했는지"는 lib/questions.ts (시험: tests/questions.test.ts). 답에 따른 신호는 판정(작업 15번)이 정한다.
import { useRef, useState } from "react";
import {
  ANSWER_LABELS,
  ANSWER_ORDER,
  isAllAnswered,
  questionsFor,
  unansweredQuestions,
} from "@/lib/questions";
import type { ReviewedValues } from "@/lib/review";
import type { Answer, QuestionKey } from "@/lib/types";
import { StepBar } from "./StepBar";

export type QuestionAnswers = Partial<Record<QuestionKey, Answer>>;

export function QuestionStep({
  reviewed,
  onBack,
  onSubmit,
}: {
  reviewed: ReviewedValues;
  onBack: () => void;
  onSubmit: (answers: QuestionAnswers) => void;
}) {
  const type = reviewed.mode;
  const questions = questionsFor(type);
  const [answers, setAnswers] = useState<QuestionAnswers>({});
  const formRef = useRef<HTMLFormElement>(null);

  const remaining = unansweredQuestions(type, answers);
  const complete = isAllAnswered(type, answers);
  const answered = questions.length - remaining.length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) {
      // 아직 답하지 않은 첫 질문으로 이동
      formRef.current?.querySelector<HTMLElement>(`input[name="q-${remaining[0].key}"]`)?.focus();
      return;
    }
    // 이 종류에 해당하는 질문의 답만 넘긴다 (예: 토지인데 이전 건물 진단의 안전진단 답이 남지 않게)
    const picked: QuestionAnswers = {};
    for (const q of questions) picked[q.key] = answers[q.key];
    onSubmit(picked);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:py-10">
      <StepBar current={3} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">몇 가지만 더 확인할게요</h1>
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
          공공 정보에는 나오지 않는 내용이에요. 잘 모르면 &quot;모르겠음&quot;을 골라 주세요. 모르는 것이 있으면 담당자 상담이
          필요한 노란불로 판정돼요.
        </p>
      </div>

      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-5">
        {questions.map((q, i) => (
          <fieldset key={q.key} className="flex flex-col gap-3 rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
            <legend className="px-2 text-lg font-semibold">
              {i + 1}. {q.text}
            </legend>
            {q.hint && <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">{q.hint}</p>}
            <div className="grid grid-cols-3 gap-2">
              {ANSWER_ORDER.map((a) => (
                <label key={a} className="cursor-pointer">
                  <input
                    type="radio"
                    name={`q-${q.key}`}
                    value={a}
                    checked={answers[q.key] === a}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.key]: a }))}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-12 items-center justify-center rounded-xl border-2 border-zinc-300 px-2 text-base font-semibold hover:border-zinc-500 peer-checked:border-sky-600 peer-checked:bg-sky-600 peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-600 dark:border-zinc-700">
                    {ANSWER_LABELS[a]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <p aria-live="polite" className="text-sm text-zinc-600 dark:text-zinc-400">
          {complete
            ? `모든 질문에 답했어요 (${answered}/${questions.length})`
            : `답한 질문 ${answered}/${questions.length} · 아직 ${remaining.length}개 질문에 답하지 않았어요`}
        </p>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="min-h-12 rounded-xl border-2 border-zinc-300 px-6 text-base font-semibold hover:border-zinc-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-zinc-700 dark:hover:border-zinc-200"
          >
            ← 확인·수정으로 돌아가기
          </button>
          <button
            type="submit"
            disabled={!complete}
            className="min-h-12 rounded-xl bg-zinc-900 px-6 text-base font-semibold text-white hover:bg-zinc-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            판정하기
          </button>
        </div>
      </form>
    </main>
  );
}
