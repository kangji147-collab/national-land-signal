"use client";
// 디자인·동작 확인용 가짜 배치 시뮬레이터 (PREVIEW_DEMO=1 일 때만 /diagnose/demo/placement 로 열림)
import { useEffect, useState } from "react";
import { type PickedPhoto } from "../../_components/PhotoStep";
import { type PlacedItem, PlacementStep, toCounts } from "../../_components/PlacementStep";
import { draw } from "../DemoProposal";

const THEMES = ["공영주차장", "태양광", "스마트팜", "소공원"] as const;

export function DemoPlacement() {
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [theme, setTheme] = useState<(typeof THEMES)[number]>("공영주차장");
  const [placed, setPlaced] = useState<PlacedItem[]>([]);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const c = draw("before");
    c.toBlob((blob) => {
      if (blob) setPhoto({ blob, width: 800, height: 500, previewUrl: c.toDataURL("image/jpeg", 0.9), originalBytes: blob.size });
    }, "image/jpeg", 0.9);
  }, []);

  if (!photo) return <p className="mx-auto w-full max-w-3xl px-4 py-10">가짜 사진을 그리는 중…</p>;
  return (
    <>
      <div role="note" className="mx-auto mt-6 flex w-full max-w-3xl flex-col gap-2 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-950">
        <p>※ 디자인·동작 확인용 예시예요. 사진은 가짜이고 아무것도 저장되지 않아요. (필지 면적은 412.5㎡로 가정)</p>
        <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
          테마 바꿔 보기:
          <select
            className="min-h-10 rounded-sm border border-amber-600 bg-white px-2"
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value as (typeof THEMES)[number]);
              setPlaced([]);
              setResult(null);
            }}
          >
            {THEMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <PlacementStep
        key={theme}
        theme={theme}
        parcelArea={412.5}
        photo={photo}
        placed={placed}
        onPlacedChange={setPlaced}
        onNext={(img) => setResult(img)}
        onSkip={() => setResult("skip")}
        onBack={() => setResult(null)}
      />
      {result && (
        <section className="mx-auto mb-10 flex w-full max-w-3xl flex-col gap-2 px-4" data-testid="demo-result">
          <h2 className="k-h2">[배치 완료]를 누르면 제안서에 들어가는 배치도</h2>
          {result === "skip" ? (
            <p>배치 없이 제안서로 넘어가요.</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result} alt="만들어진 배치도" className="w-full border border-[var(--line)]" />
          )}
          <p className="text-sm text-zinc-600">서버로 보내는 값(이름과 개수): {JSON.stringify(toCounts(placed))}</p>
        </section>
      )}
    </>
  );
}
