// 디자인·동작 확인용 가짜 배치 시뮬레이터 화면 (/diagnose/demo/placement) — PREVIEW_DEMO=1 일 때만 열림, 그 밖에는 404
// 가짜 사진 위에 시설물을 놓아 볼 수 있다. 시설물 목록은 실제 표(읽기 전용, 무료)에서 온다. 사진·배치는 저장되지 않는다.
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DemoPlacement } from "./DemoPlacement";

export default function DemoPlacementPage() {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-3xl px-4 py-10">불러오는 중…</p>}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  await connection(); // 요청 때마다 환경 변수를 확인한다 (빌드 때 굳어지지 않게)
  if (process.env.PREVIEW_DEMO !== "1") notFound();
  return <DemoPlacement />;
}
