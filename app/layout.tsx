import type { Metadata } from "next";
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
        <header className="border-b border-black/10 dark:border-white/15">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-4">
            <span aria-hidden="true">🚦</span>
            <span className="text-lg font-semibold">{SERVICE_NAME}</span>
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
        <footer className="border-t border-black/10 dark:border-white/15">
          <p className="mx-auto w-full max-w-3xl px-4 py-4 text-sm text-zinc-600 dark:text-zinc-400">
            {MESSAGES.disclaimer}
          </p>
        </footer>
      </body>
    </html>
  );
}
