import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MESSAGES, SERVICE_NAME } from "@/lib/messages";
import "./globals.css";

export const metadata: Metadata = {
  title: `${SERVICE_NAME} — 국유재산 매각 가능 여부 자가진단`,
  description: "서류만 올리면 국유지·국유 건물의 매각 가능 여부를 신호등으로 알려드려요",
};

// Design Ref: §3 — 모든 화면 공통: 위쪽 서비스 이름, 아래쪽 참고용 안내 문구
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-[var(--line)] bg-[var(--card)]">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-[1fr_auto_1fr] items-center px-6 py-4">
            <span />
            <Link href="/" className="flex items-center gap-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
              {/* 운영 기관 로고 (제공받은 공식 파일, 흰 바탕용) */}
              <Image src="/brand/kamco-logo.png" alt="한국자산관리공사" width={563} height={120} priority className="h-7 w-auto sm:h-9" />
              <span aria-hidden="true" className="h-6 w-px bg-[var(--line)]" />
              <span className="text-lg font-bold tracking-tight text-[var(--heading)] sm:text-2xl">
                <span aria-hidden="true">🚦 </span>
                {SERVICE_NAME}
              </span>
            </Link>
            <Link href="/" className="hidden justify-self-end whitespace-nowrap text-sm font-semibold sm:block text-[var(--heading)] underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
              처음으로
            </Link>
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
        <footer className="bg-[var(--navy)] text-white">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-6 py-8">
            <p className="text-lg font-bold">{SERVICE_NAME}</p>
            <p className="text-sm leading-6 text-white/80">{MESSAGES.disclaimer}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
