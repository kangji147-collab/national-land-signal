"use client";
// 디자인 확인용 가짜 제안서 (PREVIEW_DEMO=1 일 때만 /diagnose/demo 로 열림)
// 값·이미지는 모두 가짜이고 서버를 부르지 않는다. (ProposalStep 에 받아 둔 결과를 미리 넣어 API 호출이 일어나지 않게 함)
// 이미지는 브라우저 캔버스로 그린 그림이라 [PDF로 내려받기]도 시험할 수 있다.
import { useEffect, useState } from "react";
import type { IncomeRange, PurchasePrice } from "@/lib/calc";
import type { ProposalRequest } from "@/lib/proposal-request";
import type { ReviewedValues } from "@/lib/review";
import { type PickedPhoto } from "../_components/PhotoStep";
import { type ProposalData, ProposalStep } from "../_components/ProposalStep";

/** 가짜 현장 사진(빈 땅)과 가짜 개발 후 그림(주차장)을 그린다 */
function draw(kind: "before" | "after"): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 800;
  c.height = 500;
  const x = c.getContext("2d")!;
  x.fillStyle = "#cfe3f7"; // 하늘
  x.fillRect(0, 0, 800, 250);
  x.fillStyle = "#9fb3c8"; // 먼 건물
  for (const [bx, bw, bh] of [[40, 90, 150], [150, 70, 110], [560, 100, 170], [680, 80, 120]]) x.fillRect(bx, 250 - bh, bw, bh);
  x.fillStyle = kind === "before" ? "#a9b08a" : "#55595f"; // 땅 / 포장된 주차장
  x.fillRect(0, 250, 800, 250);
  if (kind === "before") {
    x.fillStyle = "#8d9a6b";
    for (let i = 0; i < 40; i++) x.fillRect((i * 97) % 780, 270 + ((i * 53) % 200), 18, 6);
  } else {
    x.strokeStyle = "#ffffff";
    x.lineWidth = 4;
    for (let i = 0; i < 7; i++) {
      x.beginPath();
      x.moveTo(60 + i * 105, 290);
      x.lineTo(40 + i * 105, 470);
      x.stroke();
    }
    const colors = ["#2f63ff", "#d9d9d9", "#e4572e", "#222222", "#f2c14e"];
    for (let i = 0; i < 5; i++) {
      x.fillStyle = colors[i];
      x.fillRect(75 + i * 105 + (i % 2) * 4, 340, 70, 90);
    }
  }
  x.fillStyle = "rgba(0,0,0,0.55)";
  x.fillRect(0, 0, 800, 34);
  x.fillStyle = "#ffffff";
  x.font = "bold 18px sans-serif";
  x.fillText(kind === "before" ? "가짜 예시 사진 (디자인 확인용)" : "가짜 예시 이미지 (디자인 확인용)", 12, 23);
  return c;
}

const REQUEST: ProposalRequest = {
  type: "land",
  landCategory: "대",
  zone: "제2종일반주거지역",
  otherZones: [],
  answers: { onbid: "yes", dispute: "no", inUse: "no" },
  theme: "공영주차장",
  area: 412.5,
  officialPrice: 3_200_000,
  totalFloorArea: null,
  buildingStandardValue: null,
  approvalDate: "",
  edited: ["area"],
};

const REVIEWED: ReviewedValues = {
  mode: "land",
  pnu: "0000000000000000000",
  address: "서울특별시 ○○구 ○○동 123-4 (가짜 예시)",
  landCategory: "대",
  area: 412.5,
  officialPrice: 3_200_000,
  officialPriceYear: 2026,
  zone: "제2종일반주거지역",
  zones: [],
  referenceZones: [],
  building: null,
  edited: ["area"],
};

const INCOME: IncomeRange = {
  ok: true,
  min: 18_000_000,
  max: 52_000_000,
  formula: "면적 ÷ 1면당 필요 면적 × 월정기 요금 × 12개월",
  used: [
    { item: "1면당 필요 면적", min: 25, max: 25, unit: "㎡/면", source: "[가짜 예시] 고정값", baseYear: 2026 },
    { item: "월정기 요금", min: 40000, max: 120000, unit: "원/월/면", source: "[가짜 예시] 지자체 자료", baseYear: 2026 },
  ],
  baseYears: [2026],
  basedOnUserEdited: true,
};

const PRICE: PurchasePrice = {
  ok: true,
  amount: 1_320_000_000,
  landAmount: 1_320_000_000,
  buildingAmount: null,
  buildingExcluded: false,
  formula: "개별공시지가 × 면적",
  basedOnUserEdited: false,
};

const DATA: ProposalData = {
  theme: "공영주차장",
  income: INCOME,
  price: PRICE,
  effects: {
    source: "table",
    sentences: [
      "방치된 땅이 주차 공간으로 바뀌어 인근 주민과 상가의 주차 불편이 줄어듭니다.",
      "꾸준한 주차 수요를 바탕으로 안정적인 운영 수입을 기대할 수 있습니다.",
      "관리되지 않던 공터가 정비되어 주변 환경이 깨끗해집니다.",
    ],
  },
  oldBuilding: null,
};

export function DemoProposal() {
  const [ready, setReady] = useState<{ photo: PickedPhoto; afterSrc: string } | null>(null);

  useEffect(() => {
    const before = draw("before");
    const after = draw("after");
    before.toBlob((blob) => {
      if (!blob) return;
      setReady({
        photo: { blob, width: 800, height: 500, previewUrl: before.toDataURL("image/jpeg", 0.9), originalBytes: blob.size },
        afterSrc: after.toDataURL("image/jpeg", 0.9),
      });
    }, "image/jpeg", 0.9);
  }, []);

  if (!ready) return <p className="mx-auto w-full max-w-3xl px-4 py-10">가짜 제안서를 그리는 중…</p>;
  return (
    <>
      <p role="note" className="mx-auto mt-6 w-full max-w-3xl border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-950">
        ※ 디자인 확인용 가짜 예시예요. 아래 숫자·이미지는 모두 가짜이고 실제 계산이 아니에요.
      </p>
      <ProposalStep
        request={REQUEST}
        reviewed={REVIEWED}
        photo={ready.photo}
        cached={DATA}
        onLoaded={() => {}}
        cachedImage={{ src: ready.afterSrc, remaining: 4 }}
        onImage={() => {}}
        onBack={() => {}}
      />
    </>
  );
}
