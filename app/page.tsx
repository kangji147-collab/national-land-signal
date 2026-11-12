// Design Ref: §3.1 — 시작 화면: 서비스 소개, "국유재산(일반재산)만 진단" 안내, 토지/건물 선택
// Plan SC: PRD must 1 규칙 1 — 시작 화면에 "국유재산(일반재산)만 진단할 수 있어요" 안내를 표시한다.
// 모양: 운영 기관(한국자산관리공사) 사이트와 어울리는 공공기관 느낌 — 흰 바탕, 짙은 남색 띠, 파랑 포인트, 각진 모서리, 얇은 구분선.
//  - 로고·캐릭터·사진·문구는 쓰지 않고 색과 분위기만 맞췄다. (사용자 요청 2026-11-12)
//  - 글과 안내 문구는 그대로이고 꾸밈만 바뀌었다. 색은 globals.css 의 --navy·--blue·--accent·--panel 을 쓴다.
import Image from "next/image";
import Link from "next/link";
import { MESSAGES } from "@/lib/messages";

// 선택 버튼 (누르면 진단 화면으로 가며, 종류는 주소 뒤에 붙인다)
const CHOICES = [
  { type: "land", icon: "🌳", title: "토지 진단하기", desc: "빈 땅·임야·밭 등 토지의 매각 가능 여부를 확인해요" },
  { type: "building", icon: "🏢", title: "건물 진단하기", desc: "국유 건물의 매각 가능 여부를 확인해요" },
] as const;

// 신호등 뜻 (PRD 3번)
const SIGNALS = [
  { icon: "🟢", label: "초록불", desc: "매각 가능", bar: "border-t-emerald-600" },
  { icon: "🟡", label: "노란불", desc: "조건부 가능 · 담당자 상담 필요", bar: "border-t-amber-500" },
  { icon: "🔴", label: "빨간불", desc: "내부 규정상 매각 불가", bar: "border-t-red-600" },
] as const;

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      {/* 소개 */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-8 px-6 pb-12 pt-12 md:grid-cols-[1fr_auto] sm:pb-16 sm:pt-16">
        <div className="flex flex-col gap-6">
        <h1 className="text-[clamp(2rem,5.5vw,3.75rem)] font-bold leading-tight tracking-tight text-[var(--heading)]">
          주소만 입력하면
          <br />
          매각 가능 여부를 바로 알려드려요
        </h1>
        <p className="max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
          국유지·국유 건물의 주소를 입력하면 공공 정보를 자동으로 가져와 신호등으로 알려드립니다. 매각이 가능하면 매수 후
          모습과 예상 수익까지 미리 볼 수 있어요.
        </p>

        {/* 안내: 국유재산(일반재산)만 진단 가능 */}
        <div
          role="note"
          className="flex w-fit max-w-full items-start gap-3 border-l-4 border-[var(--accent)] bg-[var(--panel)] px-5 py-4"
        >
          <span aria-hidden="true" className="mt-0.5 leading-none text-[var(--accent)]">
            ⓘ
          </span>
          <p className="text-base font-medium leading-7">{MESSAGES.startNotice}</p>
        </div>
        </div>
        {/* 캐릭터 (제공받은 공식 파일). 꾸밈 그림이라 읽어 주는 도구에는 숨긴다 */}
        <Image src="/brand/mascots-hello.webp" alt="" width={640} height={733} priority className="mx-auto h-auto w-56 sm:w-72 md:w-80" />
      </section>

      {/* 남색 띠: 토지/건물 선택 */}
      <div className="bg-[var(--navy)] text-white">
        <section aria-labelledby="choose-title" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12 sm:py-14">
          <h2 id="choose-title" className="text-2xl font-bold tracking-tight">
            어떤 재산인가요?
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {CHOICES.map((c) => (
              <li key={c.type}>
                <Link
                  href={`/diagnose?type=${c.type}`}
                  className="group flex h-full min-h-36 items-center gap-5 border-2 border-white/30 p-6 transition-colors hover:border-white hover:bg-white/10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <span aria-hidden="true" className="text-5xl leading-none">
                    {c.icon}
                  </span>
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="text-xl font-bold">{c.title}</span>
                    <span className="text-sm leading-6 text-white/75 group-hover:text-white">{c.desc}</span>
                  </span>
                  <span aria-hidden="true" className="text-2xl leading-none transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm leading-6 text-white/75">
            필요한 것: <strong className="font-semibold text-white">주소 (지번 또는 도로명)</strong>
            · 서류를 올릴 필요는 없어요.
          </p>
        </section>
      </div>

      {/* 신호등 뜻 */}
      <section aria-labelledby="signal-title" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12 sm:py-14">
        <h2 id="signal-title" className="text-2xl font-bold tracking-tight text-[var(--heading)]">
          신호등은 이런 뜻이에요
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {SIGNALS.map((s) => (
            <li key={s.label} className={`flex flex-col gap-2 border border-t-4 border-zinc-300 bg-[var(--panel)] p-6 dark:border-zinc-700 ${s.bar}`}>
              <span className="flex items-center gap-3">
                <span aria-hidden="true" className="text-3xl leading-none">
                  {s.icon}
                </span>
                <strong className="text-xl font-bold">{s.label}</strong>
              </span>
              <span className="text-base leading-7 text-zinc-600 dark:text-zinc-400">{s.desc}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
