// Design Ref: §3 — 진단 화면. 시작 화면에서 고른 종류(토지/건물)를 주소 뒤 ?type= 으로 받는다.
// 단계 이동과 단계 사이의 값은 DiagnoseFlow 가 맡는다. (① 주소 → ② 확인·수정 → 이후 단계는 이어서 붙인다)
import Link from "next/link";
import { Suspense } from "react";
import { DiagnoseFlow } from "./_components/DiagnoseFlow";

export default function DiagnosePage(props: PageProps<"/diagnose">) {
  // searchParams 는 요청 때 알 수 있는 값이라 Suspense 안에서 읽는다 (Cache Components)
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-3xl px-4 py-10">불러오는 중…</p>}>
      <DiagnoseContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function DiagnoseContent({ searchParams }: { searchParams: PageProps<"/diagnose">["searchParams"] }) {
  const { type } = await searchParams;

  if (type !== "land" && type !== "building") {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start gap-4 px-4 py-10">
        <h1 className="text-2xl font-bold">토지인지 건물인지 먼저 골라 주세요</h1>
        <Link
          href="/"
          className="rounded-lg border-2 border-zinc-300 px-4 py-2 font-medium hover:border-zinc-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-zinc-700 dark:hover:border-zinc-200"
        >
          ← 처음으로
        </Link>
      </main>
    );
  }

  return <DiagnoseFlow type={type} />;
}
