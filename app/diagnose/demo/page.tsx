// 디자인 확인용 가짜 제안서 화면 (/diagnose/demo)
// 실제 계산·AI 호출 없이 가짜 값으로 제안서 화면을 보여준다. 비용이 들지 않는다.
// 배포 때 실수로 열리지 않도록 PREVIEW_DEMO=1 로 켠 서버에서만 열리고, 그 밖에는 404 이다.
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DemoProposal } from "./DemoProposal";

export default function DemoPage() {
  // 요청 때 알 수 있는 값(환경 변수)을 읽으므로 Suspense 안에서 확인한다 (Cache Components)
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-3xl px-4 py-10">불러오는 중…</p>}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  await connection(); // 요청 때마다 환경 변수를 확인한다 (빌드 때 굳어지지 않게)
  if (process.env.PREVIEW_DEMO !== "1") notFound();
  return <DemoProposal />;
}
