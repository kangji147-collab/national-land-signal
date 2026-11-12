// 오류 안내 상자: 문구 + 도움말 + (다시 시도 가능할 때) "다시 시도" 버튼 + 추가 버튼(children)
// 횟수를 모두 쓴 경우는 빨간색이 아니라 노란색으로 보여, 고장이 아니라 "오늘은 여기까지"임을 알려 준다.
import type { ReactNode } from "react";
import { describeError } from "./error-info";

export function ErrorNotice({
  error,
  onRetry,
  children,
}: {
  error: { code: string; message: string };
  onRetry?: () => void;
  children?: ReactNode;
}) {
  const info = describeError(error.code);
  const showRetry = info.retryable && !!onRetry;
  const tone = info.exhausted
    ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
    : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100";

  return (
    <div role="alert" className={`flex flex-col gap-2 rounded-sm border px-4 py-3 ${tone}`}>
      <p className="text-base font-medium">{error.message}</p>
      {info.hint && <p className="text-sm">{info.hint}</p>}
      {(showRetry || children) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {showRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 rounded-sm bg-[var(--navy)] px-4 text-sm font-semibold text-white hover:bg-[var(--blue)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:bg-[var(--blue)] dark:text-white dark:hover:bg-[#8aa4ff]"
            >
              다시 시도
            </button>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
