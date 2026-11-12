// Design Ref: §3 — 모든 진단 화면 공통 단계 표시줄 (화면 보조 요소, 사용자 승인 2026-11-12)
const STEPS = ["주소", "확인", "질문", "결과", "시뮬레이션", "제안서"] as const;

export function StepBar({ current }: { current: 1 | 2 | 3 | 4 | 5 | 6 }) {
  return (
    <nav aria-label="진행 단계">
      <ol className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n === current ? "current" : n < current ? "done" : "todo";
          return (
            <li
              key={label}
              aria-current={state === "current" ? "step" : undefined}
              className={
                state === "current"
                  ? "rounded-full bg-zinc-900 px-3 py-1 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : state === "done"
                    ? "rounded-full bg-zinc-200 px-3 py-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    : "rounded-full border border-zinc-300 px-3 py-1 text-zinc-500 dark:border-zinc-700 dark:text-zinc-500"
              }
            >
              {n}. {label}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
