// Design Ref: §3 — 모든 진단 화면 공통 단계 표시줄 (화면 보조 요소, 사용자 승인 2026-11-12)
// 모양: 칸이 붙어 있는 네모 탭 — 현재 단계는 짙은 남색, 지나온 단계는 연한 파랑, 남은 단계는 흰색
const STEPS = ["주소", "확인", "질문", "결과", "시뮬레이션", "제안서"] as const;

export function StepBar({ current }: { current: 1 | 2 | 3 | 4 | 5 | 6 }) {
  return (
    <nav aria-label="진행 단계">
      <ol className="grid grid-cols-3 border-l border-t border-[var(--line)] text-sm sm:grid-cols-6">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n === current ? "current" : n < current ? "done" : "todo";
          return (
            <li
              key={label}
              aria-current={state === "current" ? "step" : undefined}
              className={
                "border-b border-r border-[var(--line)] px-2 py-3 text-center " +
                (state === "current"
                  ? "bg-[var(--navy)] font-bold text-white dark:bg-[var(--blue)] dark:text-zinc-950"
                  : state === "done"
                    ? "bg-[var(--band)] font-medium text-[var(--heading)]"
                    : "bg-[var(--card)] text-zinc-500")
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
