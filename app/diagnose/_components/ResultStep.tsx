"use client";
// Design Ref: §3.5 — ④ 판정 결과
// 확인·수정한 값과 질문 답을 서버(/api/judge)로 보내 규칙표로 판정한 결과를 보여준다. (PRD must 1 규칙 8·11·12·13·16)
//  - 🔴·🟡: 판정 근거를 함께 보여주고, 🟡에는 대표 상담 연락처를 보여준다.
//  - 민원인이 고친 항목은 "✏️ 민원인이 수정한 값"으로 표시한다. (규칙 7)
//  - 규칙표 기준 연도와 "자가진단 결과는 참고용이며…" 안내를 결과 아래에 보여준다. (규칙 13·16)
//  - 🟢에는 "사진으로 개발 모습 보기" 버튼이 있어 사진 올리기 단계(PhotoStep)로 이어진다.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MESSAGES } from "@/lib/messages";
import { buildJudgeRequest } from "@/lib/judge-request";
import { EDITED_LABELS, type ReviewedValues } from "@/lib/review";
import type { Contact } from "@/lib/rules-source";
import type { Basis, Signal } from "@/lib/types";
import { type UiError, callApi } from "./api-client";
import { ErrorNotice } from "./ErrorNotice";
import type { QuestionAnswers } from "./QuestionStep";
import { StepBar } from "./StepBar";
import { describeBasis, formatBaseYears, signalView } from "./result-view";

interface JudgeResponse {
  signal: Signal;
  reasons: Basis[];
  baseYears: number[];
  contact: Contact | null;
}

type State = { phase: "loading" } | { phase: "done"; data: JudgeResponse } | { phase: "error"; error: UiError };

const JUDGE_TIMEOUT_MS = 15_000;

const TONE: Record<Signal, string> = {
  green: "border-emerald-500 bg-emerald-50 text-emerald-950 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-50",
  yellow: "border-amber-500 bg-amber-50 text-amber-950 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-50",
  red: "border-red-500 bg-red-50 text-red-950 dark:border-red-600 dark:bg-red-950/40 dark:text-red-50",
};

export function ResultStep({
  reviewed,
  answers,
  onBack,
  onNext,
}: {
  reviewed: ReviewedValues;
  answers: QuestionAnswers;
  onBack: () => void;
  /** 🟢일 때 "사진으로 개발 모습 보기"를 누르면 (사진 올리기 단계로) */
  onNext: () => void;
}) {
  const request = useMemo(() => buildJudgeRequest(reviewed, answers), [reviewed, answers]);
  const [state, setState] = useState<State>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0); // "다시 시도"를 누를 때마다 올려서 다시 판정한다

  useEffect(() => {
    const ctl = new AbortController();
    callApi(
      "/api/judge",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) },
      JUDGE_TIMEOUT_MS,
      ctl.signal,
    ).then((r) => {
      if (r.kind === "aborted") return;
      setState(r.kind === "ok" ? { phase: "done", data: r.data as JudgeResponse } : { phase: "error", error: r.error });
    });
    return () => ctl.abort();
  }, [request, attempt]);

  function retry() {
    setState({ phase: "loading" });
    setAttempt((n) => n + 1);
  }

  const editedLabels = reviewed.edited.map((k) => EDITED_LABELS[k]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:py-10">
      <StepBar current={4} />
      <h1 className="text-2xl font-bold">판정 결과</h1>

      {state.phase === "loading" && (
        <p role="status" className="text-base text-zinc-600 dark:text-zinc-400">
          규칙표로 판정하고 있어요…
        </p>
      )}

      {state.phase === "error" && <ErrorNotice error={state.error} onRetry={retry} />}

      {state.phase === "done" && (() => {
        const { signal, reasons, baseYears, contact } = state.data;
        const view = signalView(signal);
        const years = formatBaseYears(baseYears);
        return (
          <>
            {/* 큰 신호: 색 + 글자 + 아이콘 */}
            <section role="status" aria-label="판정 결과" className={`flex flex-col gap-2 rounded-2xl border-2 p-5 ${TONE[signal]}`}>
              <p className="flex items-center gap-3 text-3xl font-bold" data-testid="signal">
                <span aria-hidden="true">{view.icon}</span>
                <span>{view.title}</span>
              </p>
              <p className="text-base leading-7">{view.summary}</p>
            </section>

            <section aria-label="판정 근거" className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{view.reasonsTitle}</h2>
              <ul className="flex flex-col gap-2" data-testid="reasons">
                {reasons.map((b, i) => {
                  const d = describeBasis(b);
                  return (
                    <li key={`${b.kind}:${b.name}:${i}`} className="rounded-xl border border-zinc-300 px-4 py-3 dark:border-zinc-700">
                      <p className="text-base font-semibold">{d.title}</p>
                      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">{d.detail}</p>
                    </li>
                  );
                })}
              </ul>
            </section>

            {editedLabels.length > 0 && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-950 dark:bg-amber-950/40 dark:text-amber-100" data-testid="edited-note">
                ✏️ {MESSAGES.userEdited}: <strong className="font-semibold">{editedLabels.join(", ")}</strong>
                <span className="block text-sm">이 결과는 민원인이 고친 값을 기준으로 한 거예요.</span>
              </p>
            )}

            {signal === "yellow" && (
              <section aria-label="상담 연락처" className="flex flex-col gap-1 rounded-xl border-2 border-amber-500 p-4" data-testid="contact">
                <h2 className="text-lg font-semibold">상담 연락처</h2>
                {contact ? (
                  <>
                    <p className="text-base">{contact.name}</p>
                    <p className="text-xl font-bold">
                      <a href={`tel:${contact.phone.replace(/[^0-9+]/g, "")}`} className="underline underline-offset-4">
                        {contact.phone}
                      </a>
                    </p>
                    {contact.hours && <p className="text-sm text-zinc-600 dark:text-zinc-400">{contact.hours}</p>}
                  </>
                ) : (
                  <p className="text-base">한국자산관리공사 담당자에게 문의해 주세요.</p>
                )}
              </section>
            )}

            {signal === "green" && (
              <button
                type="button"
                onClick={onNext}
                className="min-h-12 self-start rounded-xl bg-emerald-700 px-6 text-base font-semibold text-white hover:bg-emerald-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
              >
                사진으로 개발 모습 보기
              </button>
            )}

            {signal === "red" && (
              <p className="text-base text-zinc-600 dark:text-zinc-400">
                다른 주소를 진단하려면 처음부터 다시 시작해 주세요.
              </p>
            )}

            <div className="flex flex-col gap-1 border-t border-zinc-300 pt-4 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              {years && <p data-testid="base-years">판정에 쓴 규칙표 기준 연도: {years}</p>}
              <p data-testid="disclaimer">{MESSAGES.disclaimer}</p>
            </div>
          </>
        );
      })()}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="min-h-12 rounded-xl border-2 border-zinc-300 px-6 text-base font-semibold hover:border-zinc-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-zinc-700 dark:hover:border-zinc-200"
        >
          ← 질문으로 돌아가기
        </button>
        <Link
          href="/"
          className="flex min-h-12 items-center justify-center rounded-xl border-2 border-zinc-300 px-6 text-base font-semibold hover:border-zinc-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-zinc-700 dark:hover:border-zinc-200"
        >
          처음부터 다시 하기
        </Link>
      </div>
    </main>
  );
}
