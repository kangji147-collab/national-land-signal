"use client";
// Design Ref: §3.6 — ⑤ 현장 사진 올리기 (🟢일 때만 이 화면에 온다)
// 사진 1장(jpg·png, 10MB 이하)을 받아 브라우저에서 약 2MB로 줄이고 미리 보여준다. (PRD 보안: 10MB 이하, 약 2MB로 줄여 전송)
//  - 사진은 이 화면(브라우저 메모리)에만 있고, 어디에도 저장하지 않는다.
// 같은 화면에서 개발 테마도 고른다. (작업 17번) 테마는 테마 허용표에서 이 용도지역에 허용된 것만 보여준다.
// 건물이면 시가표준액(알면 입력)도 받는다. (작업 18번) [제안서 만들기]를 누르면 6단계에서 이미지·수익·기대효과를 만든다. (작업 20번)
import { useEffect, useRef, useState } from "react";
import { MESSAGES } from "@/lib/messages";
import { type CompressedPhoto, checkPhoto, compressImage } from "@/lib/compress-image";
import type { PropertyType } from "@/lib/types";
import { type Theme } from "@/lib/themes";
import { parseStandardValue } from "@/lib/proposal-request";
import { type UiError, callApi } from "./api-client";
import { ErrorNotice } from "./ErrorNotice";
import { StepBar } from "./StepBar";

type ThemeList = { phase: "loading" } | { phase: "done"; themes: Theme[] } | { phase: "error"; error: UiError };
const THEMES_TIMEOUT_MS = 15_000;

/** 화면에 들고 있는 사진: 줄인 파일 + 미리보기 주소 + 원본 크기 */
export interface PickedPhoto extends CompressedPhoto {
  previewUrl: string;
  originalBytes: number;
}

export function releasePhoto(p: PickedPhoto | null) {
  if (p) URL.revokeObjectURL(p.previewUrl);
}

function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
}

export function PhotoStep({
  type,
  zone,
  photo,
  onPhotoChange,
  theme,
  onThemeChange,
  valueText,
  onValueTextChange,
  onNext,
  onBack,
}: {
  type: PropertyType;
  /** 확인·수정을 마친 용도지역 (허용 테마를 찾는 데 쓴다) */
  zone: string;
  photo: PickedPhoto | null;
  onPhotoChange: (p: PickedPhoto | null) => void;
  theme: Theme | null;
  onThemeChange: (t: Theme | null) => void;
  /** 건물 시가표준액 입력 글자 (건물일 때만 쓴다) */
  valueText: string;
  onValueTextChange: (t: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [list, setList] = useState<ThemeList>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    callApi(
      "/api/themes?" + new URLSearchParams({ type, zone }).toString(),
      { method: "GET" },
      THEMES_TIMEOUT_MS,
      ctl.signal,
    ).then((r) => {
      if (r.kind === "aborted") return;
      if (r.kind !== "ok") return setList({ phase: "error", error: r.error });
      const themes = (r.data as { themes: Theme[] }).themes;
      setList({ phase: "done", themes });
      // 용도지역을 고쳐서 이전에 고른 테마가 허용되지 않게 되었다면 선택을 지운다
      if (theme && !themes.includes(theme)) onThemeChange(null);
    });
    return () => ctl.abort();
    // theme·onThemeChange 는 목록을 받은 순간의 값만 필요하다 (선택이 바뀔 때마다 다시 받지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, zone, attempt]);

  // 오늘 시뮬레이션 남은 횟수 (표시만 한다. 읽지 못해도 진행에는 영향 없음)
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    callApi("/api/usage", { method: "GET" }, 10_000, ctl.signal).then((r) => {
      if (r.kind === "ok") setRemaining((r.data as { simulate: { remaining: number } }).simulate.remaining);
    });
    return () => ctl.abort();
  }, []);

  const valueCheck = type === "building" ? parseStandardValue(valueText) : { value: null, error: undefined };
  const canNext = !!photo && !!theme && !valueCheck.error;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일을 다시 골라도 반응하도록 비운다
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const check = checkPhoto(file.size, head);
      if (!check.ok) {
        setError(check.message);
        return;
      }
      const c = await compressImage(file);
      releasePhoto(photo);
      onPhotoChange({ ...c, previewUrl: URL.createObjectURL(c.blob), originalBytes: file.size });
    } catch {
      // 사진 내용·파일 이름은 남기지 않는다
      setError("사진을 읽지 못했어요. 다른 사진으로 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    releasePhoto(photo);
    onPhotoChange(null);
    setError(null);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:py-10">
      <StepBar current={5} />
      <h1 className="text-2xl font-bold">현장 사진을 올려 주세요</h1>
      <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
        사진 1장으로 개발 후 모습을 보여 드려요. jpg 또는 png, 10MB 이하만 올릴 수 있어요.
      </p>
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-950 dark:bg-amber-950/40 dark:text-amber-100" data-testid="photo-notice">
        📷 {MESSAGES.photoNotice}
      </p>

      <div className="flex flex-col gap-3">
        <input
          ref={inputRef}
          id="photo-input"
          type="file"
          accept="image/jpeg,image/png"
          onChange={onFile}
          disabled={busy}
          className="sr-only"
          data-testid="photo-input"
        />
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="min-h-12 rounded-xl bg-zinc-900 px-6 text-base font-semibold text-white hover:bg-zinc-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {photo ? "다른 사진 고르기" : "사진 고르기"}
          </button>
          {photo && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="min-h-12 rounded-xl border-2 border-zinc-300 px-6 text-base font-semibold hover:border-zinc-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:border-zinc-700 dark:hover:border-zinc-200"
            >
              사진 빼기
            </button>
          )}
        </div>

        {busy && (
          <p role="status" className="text-base text-zinc-600 dark:text-zinc-400">
            사진을 줄이고 있어요…
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl border-2 border-red-500 bg-red-50 px-4 py-3 text-base text-red-950 dark:bg-red-950/40 dark:text-red-100" data-testid="photo-error">
            {error}
          </p>
        )}
      </div>

      {photo && (
        <figure className="flex flex-col gap-2" data-testid="photo-preview">
          {/* 미리보기는 브라우저 안의 임시 주소(blob:)라서 next/image 를 쓰지 않는다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.previewUrl} alt="올린 현장 사진 미리보기" className="max-h-96 w-full rounded-xl border border-zinc-300 object-contain dark:border-zinc-700" />
          <figcaption className="text-sm text-zinc-600 dark:text-zinc-400" data-testid="photo-info">
            원본 {formatBytes(photo.originalBytes)} → 전송용 {formatBytes(photo.blob.size)} ({photo.width}×{photo.height})
          </figcaption>
        </figure>
      )}

      <fieldset className="flex flex-col gap-3" data-testid="themes">
        <legend className="text-lg font-semibold">개발 테마를 골라 주세요</legend>
        {list.phase === "loading" && (
          <p role="status" className="text-base text-zinc-600 dark:text-zinc-400">
            고를 수 있는 테마를 불러오고 있어요…
          </p>
        )}
        {list.phase === "error" && <ErrorNotice error={list.error} onRetry={() => { setList({ phase: "loading" }); setAttempt((n) => n + 1); }} />}
        {list.phase === "done" && list.themes.length === 0 && (
          <p className="rounded-xl border-2 border-amber-500 px-4 py-3 text-base" data-testid="no-themes">
            이 용도지역에서 고를 수 있는 테마가 없어요. 담당자에게 문의해 주세요.
          </p>
        )}
        {list.phase === "done" && list.themes.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {list.themes.map((t) => (
              <label
                key={t}
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 text-base font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sky-600 ${
                  theme === t ? "border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-50" : "border-zinc-300 hover:border-zinc-900 dark:border-zinc-700 dark:hover:border-zinc-200"
                }`}
              >
                <input type="radio" name="theme" value={t} checked={theme === t} onChange={() => onThemeChange(t)} className="size-5 accent-emerald-700" />
                <span>{t}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {type === "building" && (
        <div className="flex flex-col gap-2">
          <label htmlFor="standard-value" className="text-lg font-semibold">
            건물 시가표준액 (알면 입력)
          </label>
          <input
            id="standard-value"
            inputMode="numeric"
            value={valueText}
            onChange={(e) => onValueTextChange(e.target.value)}
            placeholder="예: 150000000"
            aria-describedby="standard-value-help"
            aria-invalid={!!valueCheck.error}
            className="min-h-12 max-w-sm rounded-xl border-2 border-zinc-300 bg-transparent px-4 text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-zinc-700"
            data-testid="standard-value"
          />
          <p id="standard-value-help" className="text-sm text-zinc-600 dark:text-zinc-400">
            원 단위 숫자예요. 모르면 비워 두세요. 비우면 예상 매수 가격에 &quot;{MESSAGES.buildingExcluded}&quot;로 표시돼요.
          </p>
          {valueCheck.error && (
            <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300" data-testid="standard-value-error">
              {valueCheck.error}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!canNext}
          onClick={onNext}
          className="min-h-12 self-start rounded-xl bg-zinc-900 px-6 text-base font-semibold text-white hover:bg-zinc-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:bg-zinc-300 disabled:text-zinc-600 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
          data-testid="to-proposal"
        >
          제안서 만들기
        </button>
        {!canNext && <p className="text-sm text-zinc-600 dark:text-zinc-400">사진과 테마를 모두 고르면 이어갈 수 있어요.</p>}
        {remaining !== null && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400" data-testid="sim-remaining">
            {remaining > 0
              ? `오늘 시뮬레이션 남은 횟수: ${remaining}회. 이미지를 만들면 1회 사용돼요. (만들기에 실패하면 차감되지 않아요. 기다리다 중간에 멈추면 사용될 수 있어요)`
              : MESSAGES.simulateLimit + " 이미지 없이 예상 수익·매수 가격·기대효과만 담은 제안서는 받을 수 있어요."}
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="min-h-12 rounded-xl border-2 border-zinc-300 px-6 text-base font-semibold hover:border-zinc-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-zinc-700 dark:hover:border-zinc-200"
        >
          ← 판정 결과로 돌아가기
        </button>
      </div>
    </main>
  );
}
