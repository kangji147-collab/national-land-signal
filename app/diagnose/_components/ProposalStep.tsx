"use client";
// Design Ref: §3.7 — ⑥ 제안서 (작업 18~21번: 시뮬레이션 이미지·예상 수익·예상 매수 가격·기대효과·매수 신청 안내·PDF 내려받기)
// 서버(/api/proposal)가 🟢인지·허용 테마인지 다시 확인하고, 단가표·공시지가로 계산한 값을 돌려준다.
//  - 숫자는 화면이 계산하지 않는다. 받은 값을 그대로 보여준다.
import { useEffect, useState } from "react";
import type { IncomeRange, OldBuilding, PurchasePrice } from "@/lib/calc";
import { formatWon } from "@/lib/money";
import { MESSAGES } from "@/lib/messages";
import { buildProposalDoc } from "@/lib/proposal-doc";
import type { ProposalRequest } from "@/lib/proposal-request";
import type { ReviewedValues } from "@/lib/review";
import { type UiError, callApi } from "./api-client";
import { ErrorNotice } from "./ErrorNotice";
import type { PickedPhoto } from "./PhotoStep";
import { StepBar } from "./StepBar";

type Calc<T> = T | { ok: false; code: string; message: string };
export interface ProposalData {
  theme: string;
  income: Calc<IncomeRange>;
  price: Calc<PurchasePrice>;
  /** 기대효과 문장 (source: ai = AI가 다듬음 / table = 문장표 기본 문장) */
  effects: { sentences: string[]; source: "ai" | "table" };
  oldBuilding: OldBuilding | null;
  /** 배치 시뮬레이터로 놓은 시설물 (서버가 표와 맞춰 확인한 값). 안 썼으면 null */
  layout?: { lines: { name: string; icon: string; count: number; area: number }[]; totalArea: number } | null;
}
type State = { phase: "loading" } | { phase: "done"; data: ProposalData } | { phase: "error"; error: UiError };
// 서버가 AI 다듬기를 최대 12초 기다리므로 그보다 넉넉하게
const TIMEOUT_MS = 30_000;

const cardClass = "k-card flex flex-col gap-2";
const noteClass = "text-sm leading-6 text-zinc-600 dark:text-zinc-400";

/** 시뮬레이션 이미지: 만드는 중 / 완료(이미지 + 오늘 남은 횟수) / 실패(제외됨 + 다시 시도) */
type ImageState =
  | { phase: "loading" }
  | { phase: "done"; src: string; remaining: number | null }
  | { phase: "error"; error: UiError };
const IMAGE_TIMEOUT_MS = 110_000; // 서버가 이미지를 최대 100초 기다린다

/**
 * 이미지를 만드는 동안 "N초 지났어요"를 보여준다. (멈춘 것처럼 보이지 않게)
 * 화면에 나타날 때부터 세므로 다시 시도하면 0초부터 다시 센다. 읽어 주는 도구가 매초 읽지 않도록 aria-hidden.
 */
function ElapsedSeconds() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span aria-hidden="true" data-testid="image-elapsed" className="whitespace-nowrap">
      ({seconds}초 지났어요)
    </span>
  );
}

/** 배치도 그림(JPEG 데이터 주소)을 보낼 수 있는 파일로 바꾼다 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  const bin = atob(b64 ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("사진을 읽지 못했어요"));
    r.readAsDataURL(blob);
  });
}

export function ProposalStep({
  request,
  reviewed,
  photo,
  layoutImage,
  placed,
  cached,
  onLoaded,
  cachedImage,
  onImage,
  onBack,
}: {
  request: ProposalRequest;
  /** 확인·수정을 마친 값 (PDF의 대상지 정보·수정한 항목 표시에 쓴다) */
  reviewed: ReviewedValues;
  /** 시뮬레이션에 쓰는 줄인 사진 (화면 표시용 미리보기 주소 포함) */
  photo: PickedPhoto;
  /** 배치 시뮬레이터에서 만든 배치도 그림 (JPEG 주소). 배치하지 않았으면 null */
  layoutImage: string | null;
  /** 사진 위에 놓은 시설물(이름·위치). 시뮬레이션 이미지도 같은 배치로 그리게 서버에 알려 준다. 배치하지 않았으면 빈 목록 */
  placed: readonly { name: string; x: number; y: number }[];
  /** 같은 요청으로 이미 받아 둔 결과가 있으면 서버를 다시 부르지 않고 이것을 쓴다 (AI 재호출 방지) */
  cached: ProposalData | null;
  onLoaded: (data: ProposalData) => void;
  /** 이미 만든 시뮬레이션 이미지 (돌아갔다 와도 횟수를 또 쓰지 않는다) */
  cachedImage: { src: string; remaining: number | null } | null;
  onImage: (img: { src: string; remaining: number | null }) => void;
  onBack: () => void;
}) {
  const [image, setImage] = useState<ImageState>(cachedImage ? { phase: "done", ...cachedImage } : { phase: "loading" });
  const [imageAttempt, setImageAttempt] = useState(0);

  // 이미지는 수익·기대효과와 따로 동시에 만든다. 이미지가 실패해도 나머지 항목은 나온다.
  useEffect(() => {
    if (cachedImage && imageAttempt === 0) return;
    const ctl = new AbortController();
    const body = new FormData();
    body.append("photo", photo.blob, "site.jpg");
    // 배치한 시설물의 이름·위치와 배치도 그림을 함께 보낸다 (AI가 같은 개수·자리로 그리게)
    body.append("meta", JSON.stringify({ ...request, layoutPlan: placed.map((p) => ({ name: p.name, x: p.x, y: p.y })) }));
    if (layoutImage && placed.length > 0) body.append("layout", dataUrlToBlob(layoutImage), "layout.jpg");
    callApi("/api/simulate", { method: "POST", body }, IMAGE_TIMEOUT_MS, ctl.signal).then((r) => {
      if (r.kind === "aborted") return;
      if (r.kind === "ok") {
        const d = r.data as { image: string; remaining: number | null };
        onImage({ src: d.image, remaining: d.remaining });
        setImage({ phase: "done", src: d.image, remaining: d.remaining });
      } else {
        setImage({ phase: "error", error: r.error });
      }
    });
    return () => ctl.abort();
    // cachedImage·onImage·photo 는 시작할 때의 값만 필요하다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, imageAttempt]);

  const [state, setState] = useState<State>(cached ? { phase: "done", data: cached } : { phase: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (cached && attempt === 0) return; // 받아 둔 결과가 있으면 그대로 쓴다
    const ctl = new AbortController();
    callApi(
      "/api/proposal",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) },
      TIMEOUT_MS,
      ctl.signal,
    ).then((r) => {
      if (r.kind === "aborted") return;
      if (r.kind === "ok") {
        onLoaded(r.data as ProposalData);
        setState({ phase: "done", data: r.data as ProposalData });
      } else {
        setState({ phase: "error", error: r.error });
      }
    });
    return () => ctl.abort();
    // cached·onLoaded 는 시작할 때의 값만 필요하다 (결과를 받아 저장해도 다시 부르지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, attempt]);

  // PDF: 계산 결과가 있고 이미지 만들기가 끝났을 때(성공이든 실패든) 내려받을 수 있다. (이미지 실패 시 "제외됨"으로 표시)
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const canDownload = state.phase === "done" && image.phase !== "loading";

  async function downloadPdf() {
    if (state.phase !== "done" || image.phase === "loading") return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const imageIncluded = image.phase === "done";
      const doc = buildProposalDoc({ reviewed, proposal: state.data, imageIncluded, layoutImageIncluded: !!layoutImage });
      // PDF 도구는 무거워서 이 버튼을 누를 때만 불러온다
      const { downloadProposalPdf } = await import("./ProposalPdf");
      await downloadProposalPdf(doc, imageIncluded ? await blobToDataUrl(photo.blob) : null, image.phase === "done" ? image.src : null, layoutImage);
    } catch {
      // 사진·내용은 남기지 않는다
      setPdfError("PDF를 만들지 못했어요. 잠시 후 다시 시도해 주세요");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:py-10">
      <StepBar current={6} />
      {/* 문서 머리: 짙은 남색 칸에 제목과 선택한 테마 */}
      <header className="flex flex-col gap-1 bg-[var(--navy)] px-6 py-6 text-white dark:bg-[var(--blue)]">
        <p className="text-sm font-medium opacity-80">국유재산 매각 가능 여부 자가진단</p>
        <h1 className="text-3xl font-bold tracking-tight">개발 제안서</h1>
        <p className="text-base">
          선택한 테마: <strong className="font-bold">{request.theme}</strong>
        </p>
      </header>

      {state.phase === "done" && state.data.layout && state.data.layout.lines.length > 0 && (
        <section className={cardClass} data-testid="layout-card">
          <h2 className="k-h2">배치도 (직접 배치한 안)</h2>
          {layoutImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={layoutImage} alt="사진 위에 시설물을 직접 배치한 그림" className="w-full rounded-sm border border-zinc-300 object-contain dark:border-zinc-700" data-testid="layout-image" />
          )}
          <ul className="text-base leading-7" data-testid="layout-lines">
            {state.data.layout.lines.map((l) => (
              <li key={l.name} className="flex justify-between gap-3 border-b border-[var(--line)] py-1">
                <span>
                  {l.icon} {l.name} × {l.count}
                </span>
                <span className={noteClass}>{l.area.toLocaleString("ko-KR")}㎡</span>
              </li>
            ))}
          </ul>
          <p className={noteClass}>
            시설물 면적 합 {state.data.layout.totalArea.toLocaleString("ko-KR")}㎡ / 필지 면적 {reviewed.area.toLocaleString("ko-KR")}㎡. 사진에는 축척이 없어 놓은 위치는 참고용 그림이고, 개수와 면적이 예상 수익 계산에 쓰였어요.
          </p>
        </section>
      )}

      <section className={cardClass} data-testid="simulation">
        <h2 className="k-h2">시뮬레이션 이미지</h2>
        {image.phase === "loading" && (
          <p role="status" className="text-base text-zinc-600 dark:text-zinc-400" data-testid="image-loading">
            개발 후 모습을 만들고 있어요. 1분 정도 걸릴 수 있어요… <ElapsedSeconds />
          </p>
        )}
        {image.phase === "done" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <figure className="flex flex-col gap-1">
                {/* 브라우저 안의 임시 주소(blob:)·데이터 주소라서 next/image 를 쓰지 않는다 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt="올린 현장 사진" className="w-full rounded-sm border border-zinc-300 object-contain dark:border-zinc-700" />
                <figcaption className={noteClass}>현재 사진</figcaption>
              </figure>
              <figure className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.src} alt={`${request.theme}로 개발한 뒤의 모습 (AI가 만든 예시 이미지)`} className="w-full rounded-sm border border-zinc-300 object-contain dark:border-zinc-700" data-testid="image-after" />
                <figcaption className={noteClass}>개발 후 (AI가 만든 예시 이미지)</figcaption>
              </figure>
            </div>
            <p className={noteClass}>실제 개발 결과와 다를 수 있는 참고용 이미지예요.</p>
            {image.remaining !== null && (
              <p className={noteClass} data-testid="image-remaining">오늘 시뮬레이션 남은 횟수: {image.remaining}회</p>
            )}
          </>
        )}
        {image.phase === "error" && (
          <>
            <p className="text-base font-semibold" data-testid="image-failed">{MESSAGES.imageFailed}</p>
            <ErrorNotice
              error={image.error}
              onRetry={() => {
                setImage({ phase: "loading" });
                setImageAttempt((n) => n + 1);
              }}
            />
          </>
        )}
      </section>

      {state.phase === "loading" && (
        <p role="status" className="text-base text-zinc-600 dark:text-zinc-400">
          계산하고 있어요…
        </p>
      )}
      {state.phase === "error" && (
        <ErrorNotice
          error={state.error}
          onRetry={() => {
            setState({ phase: "loading" });
            setAttempt((n) => n + 1);
          }}
        />
      )}
      {state.phase === "done" && <Results data={state.data} />}

      <section className={cardClass} data-testid="purchase-guide">
        <h2 className="k-h2">{MESSAGES.purchaseGuideHeading}</h2>
        {MESSAGES.purchaseGuide.map((l) => (
          <p key={l} className={noteClass}>
            {l}
          </p>
        ))}
      </section>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={downloadPdf}
          disabled={!canDownload || pdfBusy}
          className="min-h-12 self-start rounded-sm bg-[var(--navy)] px-6 text-base font-semibold text-white hover:bg-[var(--blue)] dark:bg-[var(--blue)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:bg-zinc-300 disabled:text-zinc-600 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
          data-testid="pdf-download"
        >
          {pdfBusy ? "PDF를 만들고 있어요…" : "PDF로 내려받기"}
        </button>
        {!canDownload && (
          <p className={noteClass} data-testid="pdf-wait">
            {image.phase === "loading" || state.phase === "loading"
              ? "이미지와 계산이 끝나면 내려받을 수 있어요."
              : "계산 결과를 받지 못해 PDF를 만들 수 없어요. 위의 다시 시도를 눌러 주세요."}
          </p>
        )}
        {image.phase === "error" && canDownload && (
          <p className={noteClass}>이미지 없이도 내려받을 수 있어요. PDF에는 &quot;{MESSAGES.imageFailed}&quot;로 표시돼요.</p>
        )}
        {pdfError && (
          <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300" data-testid="pdf-error">
            {pdfError}
          </p>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={onBack}
          className="min-h-12 rounded-sm border-2 border-[var(--navy)] px-6 text-base font-semibold text-[var(--heading)] hover:bg-[var(--panel)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-[var(--blue)]"
        >
          ← 사진·테마 다시 고르기
        </button>
      </div>
    </main>
  );
}

function Results({ data }: { data: ProposalData }) {
  const { income, price, oldBuilding } = data;
  // (data.effects 는 아래 기대효과 칸에서 쓴다)
  return (
    <>
      {oldBuilding?.status === "old" && (
        <p
          className="rounded-sm border-2 border-amber-500 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
          data-testid="old-building"
        >
          ⚠️ {MESSAGES.oldBuilding} (사용승인 후 {oldBuilding.years}년)
        </p>
      )}
      {oldBuilding?.status === "unknown" && (
        <p className="rounded-sm border-2 border-zinc-300 px-4 py-3 text-base dark:border-zinc-700" data-testid="old-unknown">
          사용승인일 확인 필요 — 30년 이상 된 건물이면 안전진단이 필요해요.
        </p>
      )}

      <section className={cardClass} data-testid="income">
        <h2 className="k-h2">예상 수익 (연)</h2>
        {income.ok ? (
          <>
            <p className="text-3xl font-bold text-[var(--heading)]" data-testid="income-range">
              {income.min === 0 && income.max === 0 ? "직접 수익 없음" : `${formatWon(income.min)} ~ ${formatWon(income.max)}`}
            </p>
            <p className={noteClass}>계산식: {income.formula}</p>
            <ul className={noteClass} data-testid="income-sources">
              {income.used.map((u) => (
                <li key={u.item}>
                  {u.item}: {u.min.toLocaleString("ko-KR")}~{u.max.toLocaleString("ko-KR")} {u.unit} · 출처 {u.source} · 기준 연도 {u.baseYear}
                </li>
              ))}
            </ul>
            {income.used.length === 0 && <p className={noteClass}>소공원은 직접 수익보다 기대효과가 중심이에요.</p>}
            {income.basedOnUserEdited && (
              <p className="text-sm font-semibold" data-testid="income-edited">
                {MESSAGES.userEditedBasis}
              </p>
            )}
          </>
        ) : (
          <p className="text-base" data-testid="income-fail">
            예상 수익을 계산할 수 없어요. {income.message}
          </p>
        )}
        <p className={noteClass}>{MESSAGES.incomeNotice}</p>
      </section>

      <section className={cardClass} data-testid="price">
        <h2 className="k-h2">예상 매수 가격</h2>
        {price.ok ? (
          <>
            <p className="text-3xl font-bold text-[var(--heading)]" data-testid="price-amount">
              약 {formatWon(price.amount)}
            </p>
            <p className={noteClass}>계산식: {price.formula}</p>
            <p className={noteClass}>
              토지분 {formatWon(price.landAmount)}
              {price.buildingAmount !== null && ` + 건물분(시가표준액) ${formatWon(price.buildingAmount)}`}
            </p>
            {price.buildingExcluded && (
              <p className="text-sm font-semibold" data-testid="building-excluded">
                {MESSAGES.buildingExcluded}
              </p>
            )}
            {price.basedOnUserEdited && (
              <p className="text-sm font-semibold" data-testid="price-edited">
                {MESSAGES.userEditedBasis}
              </p>
            )}
          </>
        ) : (
          <p className="text-base" data-testid="price-fail">
            예상 매수 가격을 계산할 수 없어요. {price.message}
          </p>
        )}
        <p className={noteClass}>{MESSAGES.priceNotice}</p>
      </section>

      <section className={cardClass} data-testid="effects">
        <h2 className="k-h2">기대효과</h2>
        {data.effects.sentences.length > 0 ? (
          <ul className="list-disc space-y-2 pl-5 text-base leading-7">
            {data.effects.sentences.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="text-base" data-testid="effects-empty">이 테마의 기대효과 문장이 아직 준비되지 않았어요.</p>
        )}
        <p className={noteClass}>기대효과는 문장표를 바탕으로 한 일반적인 설명이며, 구체적인 수치를 약속하지 않아요.</p>
      </section>

      <p className={noteClass}>※ 이 제안서는 참고용이며 최종 매각 여부는 한국자산관리공사 심사로 결정됩니다.</p>
    </>
  );
}
