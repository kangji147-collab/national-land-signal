// Design Ref: §3.1 — 시작 화면: 서비스 소개, "국유재산(일반재산)만 진단" 안내, 토지/건물 선택
// Plan SC: PRD must 1 규칙 1 — 시작 화면에 "국유재산(일반재산)만 진단할 수 있어요" 안내를 표시한다.
import Link from "next/link";
import { MESSAGES } from "@/lib/messages";

// 선택 버튼 (누르면 진단 화면으로 가며, 종류는 주소 뒤에 붙인다)
const CHOICES = [
  { type: "land", icon: "🌳", title: "토지 진단하기", desc: "빈 땅·임야·밭 등 토지의 매각 가능 여부를 확인해요" },
  { type: "building", icon: "🏢", title: "건물 진단하기", desc: "국유 건물의 매각 가능 여부를 확인해요" },
] as const;

// 신호등 뜻 (PRD 3번)
const SIGNALS = [
  { icon: "🟢", label: "초록불", desc: "매각 가능" },
  { icon: "🟡", label: "노란불", desc: "조건부 가능 · 담당자 상담 필요" },
  { icon: "🔴", label: "빨간불", desc: "내부 규정상 매각 불가" },
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:py-14">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
          주소만 입력하면 매각 가능 여부를 바로 알려드려요
        </h1>
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
          국유지·국유 건물의 주소를 입력하면 공공 정보를 자동으로 가져와 신호등으로 알려드립니다. 매각이 가능하면 매수 후
          모습과 예상 수익까지 미리 볼 수 있어요.
        </p>
      </section>

      {/* 안내 상자: 국유재산(일반재산)만 진단 가능 */}
      <div
        role="note"
        className="flex items-start gap-3 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sky-950 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-100"
      >
        <span aria-hidden="true" className="mt-0.5 text-lg leading-none">
          ⓘ
        </span>
        <p className="text-base font-medium leading-7">{MESSAGES.startNotice}</p>
      </div>

      {/* 토지 / 건물 선택 */}
      <section aria-labelledby="choose-title" className="flex flex-col gap-4">
        <h2 id="choose-title" className="text-lg font-semibold">
          어떤 재산인가요?
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {CHOICES.map((c) => (
            <li key={c.type}>
              <Link
                href={`/diagnose?type=${c.type}`}
                className="flex h-full min-h-28 flex-col gap-2 rounded-2xl border-2 border-zinc-300 bg-white p-5 transition-colors hover:border-zinc-900 hover:bg-zinc-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-200 dark:hover:bg-zinc-800"
              >
                <span className="flex items-center gap-3 text-xl font-bold">
                  <span aria-hidden="true" className="text-3xl leading-none">
                    {c.icon}
                  </span>
                  {c.title}
                </span>
                <span className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">{c.desc}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          필요한 것: <strong className="font-semibold text-zinc-900 dark:text-zinc-100">주소 (지번 또는 도로명)</strong>
          · 서류를 올릴 필요는 없어요.
        </p>
      </section>

      {/* 신호등 뜻 */}
      <section aria-labelledby="signal-title" className="flex flex-col gap-3">
        <h2 id="signal-title" className="text-lg font-semibold">
          신호등은 이런 뜻이에요
        </h2>
        <ul className="flex flex-col gap-2">
          {SIGNALS.map((s) => (
            <li key={s.label} className="flex items-center gap-3 text-base">
              <span aria-hidden="true" className="text-2xl leading-none">
                {s.icon}
              </span>
              <span>
                <strong className="font-semibold">{s.label}</strong>
                <span className="text-zinc-600 dark:text-zinc-400"> — {s.desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
