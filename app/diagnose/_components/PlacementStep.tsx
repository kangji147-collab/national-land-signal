"use client";
// Design Ref: §3.6-2 — ⑤-2 배치 시뮬레이터: 올린 사진 위에 시설물(지도 범례처럼)을 끌어다 놓아 본다. (🟢·토지일 때만)
//  - 시설물 이름·면적·수익 단위는 시설물 표(/api/layout-items)에서 온다. 개수·면적만 계산에 쓰고, 놓은 "위치"는 그림으로만 쓴다.
//    (사진에는 축척이 없어서 위치로 크기를 잴 수 없다)
//  - 마우스·터치로 끌어서 옮기고, 키보드로도 움직인다 (방향키 이동, Delete 삭제).
//  - 사진·배치는 이 화면(브라우저 메모리)에만 있고 어디에도 저장하지 않는다. 서버에는 "이름과 개수"만 보낸다.
import { useEffect, useMemo, useRef, useState } from "react";
import { type LayoutItem, type PlacedCount, clamp01, fitsParcel, summarizeLayout, usagePercent } from "@/lib/layout";
import { type UiError, callApi } from "./api-client";
import { ErrorNotice } from "./ErrorNotice";
import type { PickedPhoto } from "./PhotoStep";
import { StepBar } from "./StepBar";

/** 사진 위에 놓인 시설물 하나 (위치는 사진 가로·세로에 대한 0~1 비율) */
export interface PlacedItem {
  id: number;
  name: string;
  x: number;
  y: number;
}

/** 같은 이름끼리 모아 "이름과 개수"로 (서버로 보내는 값) */
export function toCounts(placed: readonly PlacedItem[]): PlacedCount[] {
  const m = new Map<string, number>();
  for (const p of placed) m.set(p.name, (m.get(p.name) ?? 0) + 1);
  return [...m].map(([name, count]) => ({ name, count }));
}

type ItemsState = { phase: "loading" } | { phase: "done"; items: LayoutItem[] } | { phase: "error"; error: UiError };
const ITEMS_TIMEOUT_MS = 15_000;
const KEY_STEP = 0.02; // 방향키 한 번에 사진 크기의 2%

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("사진을 읽지 못했어요"));
    img.src = src;
  });
}

/** 사진 + 놓은 시설물 이름표를 한 장의 그림(JPEG)으로 합친다. 제안서 화면·PDF의 "배치도"에 쓴다 */
async function renderLayoutImage(photo: PickedPhoto, items: LayoutItem[], placed: readonly PlacedItem[]): Promise<string> {
  const img = await loadImage(photo.previewUrl);
  const W = Math.min(1200, img.naturalWidth);
  const H = Math.round((img.naturalHeight / img.naturalWidth) * W);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas 를 쓸 수 없어요");
  g.drawImage(img, 0, 0, W, H);
  const byName = new Map(items.map((i) => [i.name, i]));
  const fs = Math.max(14, Math.round(W / 55));
  g.font = `600 ${fs}px sans-serif`;
  g.textBaseline = "middle";
  for (const p of placed) {
    const it = byName.get(p.name);
    if (!it) continue;
    const label = `${it.icon} ${it.name}`;
    const w = g.measureText(label).width + fs * 1.2;
    const h = fs * 2;
    const x = Math.min(W - w, Math.max(0, p.x * W - w / 2));
    const y = Math.min(H - h, Math.max(0, p.y * H - h / 2));
    g.fillStyle = "rgba(8,32,94,0.92)";
    g.beginPath();
    g.roundRect(x, y, w, h, h / 2);
    g.fill();
    g.strokeStyle = "#ffffff";
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = "#ffffff";
    g.fillText(label, x + fs * 0.6, y + h / 2);
  }
  // 왼쪽 위 표시: 직접 배치한 그림임을 알린다
  const tag = "직접 배치안";
  g.font = `700 ${fs}px sans-serif`;
  const tw = g.measureText(tag).width + fs * 1.4;
  g.fillStyle = "#0e3aaa";
  g.fillRect(0, 0, tw, fs * 2);
  g.fillStyle = "#ffffff";
  g.fillText(tag, fs * 0.7, fs);
  return c.toDataURL("image/jpeg", 0.88);
}

export function PlacementStep({
  theme,
  parcelArea,
  photo,
  placed,
  onPlacedChange,
  onNext,
  onSkip,
  onBack,
}: {
  theme: string;
  /** 확인·수정을 마친 필지 면적(㎡) */
  parcelArea: number;
  photo: PickedPhoto;
  placed: PlacedItem[];
  onPlacedChange: (p: PlacedItem[]) => void;
  /** 배치를 마치고 제안서로: 그림(JPEG 주소)을 함께 넘긴다 */
  onNext: (layoutImage: string) => void;
  /** 배치 없이 제안서로 (면적 기준으로 계산) */
  onSkip: () => void;
  onBack: () => void;
}) {
  const [list, setList] = useState<ItemsState>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [compare, setCompare] = useState(false); // 원본(배치 전) 보기
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const nextId = useRef(placed.reduce((m, p) => Math.max(m, p.id), 0) + 1);

  useEffect(() => {
    const ctl = new AbortController();
    callApi("/api/layout-items?" + new URLSearchParams({ theme }).toString(), { method: "GET" }, ITEMS_TIMEOUT_MS, ctl.signal).then((r) => {
      if (r.kind === "aborted") return;
      if (r.kind !== "ok") return setList({ phase: "error", error: r.error });
      const items = (r.data as { items: LayoutItem[] }).items;
      setList({ phase: "done", items });
      // 표가 바뀌어 없어진 시설물은 화면에서도 뺀다
      const names = new Set(items.map((i) => i.name));
      if (placed.some((p) => !names.has(p.name))) onPlacedChange(placed.filter((p) => names.has(p.name)));
    });
    return () => ctl.abort();
    // placed·onPlacedChange 는 목록을 받은 순간의 값만 필요하다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, attempt]);

  const items = useMemo<LayoutItem[]>(() => (list.phase === "done" ? list.items : []), [list]);
  const byName = useMemo(() => new Map(items.map((i) => [i.name, i])), [items]);
  const summary = useMemo(() => summarizeLayout(items, toCounts(placed)), [items, placed]);
  const totalArea = summary.ok ? summary.totalArea : 0;
  const over = !fitsParcel(totalArea, parcelArea) && placed.length > 0;
  const percent = usagePercent(totalArea, parcelArea);
  const hasIncomeItem = summary.ok && summary.units > 0;

  function add(item: LayoutItem) {
    const n = placed.length;
    const id = nextId.current++;
    // 겹쳐 쌓이지 않도록 조금씩 어긋나게 놓는다
    const p: PlacedItem = { id, name: item.name, x: clamp01(0.22 + ((n * 0.13) % 0.56)), y: clamp01(0.32 + ((n * 0.17) % 0.46)) };
    onPlacedChange([...placed, p]);
    setSelected(id);
    setCompare(false);
  }
  const move = (id: number, x: number, y: number) => onPlacedChange(placed.map((p) => (p.id === id ? { ...p, x: clamp01(x), y: clamp01(y) } : p)));
  const remove = (id: number) => {
    onPlacedChange(placed.filter((p) => p.id !== id));
    if (selected === id) setSelected(null);
  };

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, p: PlacedItem) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // 집은 자리에서 이름표 중심까지의 차이를 기억해서, 잡는 순간 튀지 않게 한다
    drag.current = { id: p.id, dx: p.x - (e.clientX - rect.left) / rect.width, dy: p.y - (e.clientY - rect.top) / rect.height };
    setSelected(p.id);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>, p: PlacedItem) {
    const d = drag.current;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!d || d.id !== p.id || !rect) return;
    move(p.id, (e.clientX - rect.left) / rect.width + d.dx, (e.clientY - rect.top) / rect.height + d.dy);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>, p: PlacedItem) {
    const k: Record<string, [number, number]> = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] };
    if (k[e.key]) {
      e.preventDefault();
      move(p.id, p.x + k[e.key][0], p.y + k[e.key][1]);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(p.id);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      onNext(await renderLayoutImage(photo, items, placed));
    } catch {
      setError("배치도를 만들지 못했어요. 잠시 후 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  const ghost = "min-h-12 rounded-sm border-2 border-[var(--navy)] px-5 text-base font-semibold text-[var(--heading)] hover:bg-[var(--panel)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 dark:border-[var(--blue)]";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:py-10">
      <StepBar current={5} />
      <h1 className="text-2xl font-bold text-[var(--heading)]">시설물을 직접 배치해 보세요</h1>
      <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
        아래 시설물을 눌러 사진 위에 올리고, 끌어서 원하는 자리로 옮겨 보세요. 놓은 <strong className="font-semibold">개수와 면적</strong>이 예상 수익 계산에 쓰여요.
        사진에는 축척이 없어서 놓은 위치는 그림으로만 쓰여요.
      </p>

      {list.phase === "loading" && (
        <p role="status" className="text-base text-zinc-600 dark:text-zinc-400">
          시설물 목록을 불러오고 있어요…
        </p>
      )}
      {list.phase === "error" && (
        <ErrorNotice
          error={list.error}
          onRetry={() => {
            setList({ phase: "loading" });
            setAttempt((n) => n + 1);
          }}
        />
      )}
      {list.phase === "done" && items.length === 0 && (
        <p className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-base text-amber-950" data-testid="no-layout-items">
          이 테마는 배치할 시설물이 아직 없어요. 배치 없이 제안서를 만들 수 있어요.
        </p>
      )}

      {list.phase === "done" && items.length > 0 && (
        <>
          {/* 시설물 칩: 눌러서 사진 위에 올린다 */}
          <section className="k-card flex flex-col gap-3" aria-label="시설물 고르기">
            <div className="flex items-center justify-between gap-3">
              <h2 className="k-h2">시설물 추가</h2>
              <button type="button" className="text-sm font-semibold text-red-700 underline underline-offset-4 disabled:opacity-40 dark:text-red-300" onClick={() => { onPlacedChange([]); setSelected(null); }} disabled={placed.length === 0} data-testid="clear-all">
                모두 지우기
              </button>
            </div>
            <ul className="flex flex-wrap gap-2" data-testid="legend">
              {items.map((it) => (
                <li key={it.name}>
                  <button
                    type="button"
                    onClick={() => add(it)}
                    className="flex min-h-11 items-center gap-2 rounded-sm border border-[var(--line)] bg-[var(--panel)] px-3 text-base font-medium hover:border-[var(--navy)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:hover:border-[var(--blue)]"
                    aria-label={`${it.name} 추가 (한 개당 ${it.areaM2}㎡)`}
                  >
                    <span aria-hidden="true">{it.icon}</span>
                    <span>{it.name}</span>
                    <span className="text-sm text-zinc-500">{it.areaM2}㎡</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* 사진 + 이름표 */}
          <section className="flex flex-col gap-2" aria-label="배치 화면">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-sm bg-[var(--navy)] px-3 py-1 text-sm font-bold text-white dark:bg-[var(--blue)]">{compare ? "BEFORE · 원본" : "AFTER · 직접 배치안"}</span>
              <button type="button" className={ghost} onClick={() => setCompare((v) => !v)} aria-pressed={compare} data-testid="compare">
                {compare ? "배치안 보기" : "원본(배치 전) 비교"}
              </button>
            </div>
            <div ref={wrapRef} className="relative w-full touch-none select-none overflow-hidden border border-[var(--line)]" style={{ aspectRatio: `${photo.width} / ${photo.height}` }} data-testid="canvas" onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "IMG") setSelected(null); }}>
              {/* 브라우저 안의 임시 주소(blob:)라서 next/image 를 쓰지 않는다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.previewUrl} alt="올린 현장 사진 (시설물을 올리는 바탕)" className="pointer-events-none absolute inset-0 h-full w-full object-cover" draggable={false} />
              {!compare &&
                placed.map((p) => {
                  const it = byName.get(p.name);
                  if (!it) return null;
                  const sel = selected === p.id;
                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${it.name}. 방향키로 움직이고 Delete 키로 지워요`}
                      data-testid="placed"
                      data-name={p.name}
                      onPointerDown={(e) => onPointerDown(e, p)}
                      onPointerMove={(e) => onPointerMove(e, p)}
                      onPointerUp={() => (drag.current = null)}
                      onPointerCancel={() => (drag.current = null)}
                      onKeyDown={(e) => onKeyDown(e, p)}
                      onFocus={() => setSelected(p.id)}
                      className={`absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center gap-1 whitespace-nowrap rounded-full border-2 bg-[var(--navy)]/90 px-3 py-1.5 text-sm font-semibold text-white shadow-md active:cursor-grabbing focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${sel ? "z-10 border-yellow-300" : "border-white"}`}
                      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                    >
                      <span aria-hidden="true">{it.icon}</span>
                      <span>{it.name}</span>
                      <button
                        type="button"
                        aria-label={`${it.name} 빼기`}
                        className="ml-1 rounded-full px-1.5 leading-none text-white/90 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => remove(p.id)}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
            </div>
          </section>

          {/* 합계 */}
          <section className="k-card flex flex-col gap-3" aria-label="배치 요약" data-testid="summary">
            <h2 className="k-h2">배치 요약</h2>
            {placed.length === 0 ? (
              <p className="text-base text-zinc-600 dark:text-zinc-400">아직 놓은 시설물이 없어요.</p>
            ) : (
              summary.ok && (
                <ul className="flex flex-col gap-1 text-base">
                  {summary.lines.map((l) => (
                    <li key={l.name} className="flex justify-between gap-3 border-b border-[var(--line)] py-1">
                      <span>
                        {l.icon} {l.name} × {l.count}
                      </span>
                      <span className="text-zinc-600 dark:text-zinc-400">{l.area.toLocaleString("ko-KR")}㎡</span>
                    </li>
                  ))}
                </ul>
              )
            )}
            <div>
              <p className="text-sm font-semibold" data-testid="usage-text">
                필지 면적 {parcelArea.toLocaleString("ko-KR")}㎡ 중 시설물 {totalArea.toLocaleString("ko-KR")}㎡ ({percent}%)
              </p>
              <div className="mt-1 h-3 w-full bg-[var(--band)]" role="img" aria-label={`필지 면적의 ${percent}% 사용`}>
                <div className={`h-full ${over ? "bg-red-600" : "bg-[var(--navy)] dark:bg-[var(--blue)]"}`} style={{ width: `${Math.min(100, percent)}%` }} />
              </div>
            </div>
            {over && (
              <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300" data-testid="over-warning">
                시설물 면적이 필지 면적을 넘었어요. 시설물을 빼거나 줄여 주세요.
              </p>
            )}
            {summary.ok && hasIncomeItem && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400" data-testid="units-note">
                예상 수익은 배치한 {summary.unitLabel === "면" ? "주차면" : summary.unitLabel === "kW" ? "태양광 용량" : "재배 면적"} {summary.units.toLocaleString("ko-KR")}
                {summary.unitLabel}으로 계산해요.
              </p>
            )}
            {placed.length > 0 && !hasIncomeItem && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400" data-testid="no-income-note">
                수익 계산에 쓰이는 시설물이 없어서, 예상 수익은 필지 면적 기준으로 계산해요.
              </p>
            )}
          </section>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={finish}
          disabled={busy || over || placed.length === 0 || list.phase !== "done"}
          className="min-h-12 rounded-sm bg-[var(--navy)] px-6 text-base font-semibold text-white hover:bg-[var(--blue)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:bg-zinc-300 disabled:text-zinc-600 dark:bg-[var(--blue)] dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
          data-testid="finish"
        >
          {busy ? "배치도를 만들고 있어요…" : "배치 완료 → 제안서 만들기"}
        </button>
        <button type="button" onClick={onSkip} disabled={busy} className={ghost} data-testid="skip">
          배치 없이 제안서 만들기
        </button>
        <button type="button" onClick={onBack} disabled={busy} className={ghost}>
          ← 사진·테마 다시 고르기
        </button>
      </div>
    </main>
  );
}
