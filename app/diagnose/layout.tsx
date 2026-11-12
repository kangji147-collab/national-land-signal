// Design Ref: §3 — 진단 화면 공통 위쪽 배너: 짙은 남색 띠 + 경로(홈 › 자가진단) + 큰 제목 (공공기관 사이트의 안쪽 페이지 느낌)
import Image from "next/image";
import Link from "next/link";

export default function DiagnoseLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="relative overflow-hidden border-b-4 border-[var(--blue)] bg-[var(--navy)] text-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-6 py-8 sm:py-10">
          <nav aria-label="현재 위치" className="text-sm text-white/75">
            <Link href="/" className="underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white">
              홈
            </Link>
            <span aria-hidden="true"> › </span>
            <span>매각 가능 여부 자가진단</span>
          </nav>
          <p className="text-3xl font-bold tracking-tight sm:text-4xl">매각 가능 여부 자가진단</p>
        </div>
        <Image src="/brand/mascot-megaphone.webp" alt="" width={480} height={467} className="absolute -bottom-1 right-6 hidden h-32 w-auto sm:block lg:right-[max(1.5rem,calc((100%-64rem)/2+1.5rem))]" />
      </div>
      {children}
    </>
  );
}
