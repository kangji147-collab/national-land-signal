"use client";
// Design Ref: §3 — 진단 화면의 단계 이동. 단계 사이에 주고받는 값을 한곳에서 들고 있다.
//   1 주소·필지 선택(AddressStep) → 2 확인·수정(ReviewStep) → 3 보완 질문(QuestionStep) → 4 판정 결과(ResultStep) → 이후 단계는 이어서 붙인다
// 값은 이 화면(브라우저) 메모리에만 있다. 새로고침하면 처음부터 다시 한다. (어디에도 저장하지 않음)
//
// 앞 단계로 돌아가도 이전 입력이 남도록, 지나온 단계는 지우지 않고 감춰 둔다(hidden).
//  - 주소 검색·조회는 하루 횟수가 정해져 있어서, 돌아왔을 때 다시 검색하게 하면 횟수를 낭비한다.
//  - 확인·수정·질문 화면은 같은 필지·종류인 동안 민원인이 고른 값을 그대로 보여준다.
import { useEffect, useMemo, useState } from "react";
import { buildProposalRequest, parseStandardValue } from "@/lib/proposal-request";
import type { ReviewSource, ReviewedValues } from "@/lib/review";
import type { Theme } from "@/lib/themes";
import { AddressStep } from "./AddressStep";
import { type PickedPhoto, PhotoStep, releasePhoto } from "./PhotoStep";
import { type ProposalData, ProposalStep } from "./ProposalStep";
import { type QuestionAnswers, QuestionStep } from "./QuestionStep";
import { ResultStep } from "./ResultStep";
import { ReviewStep } from "./ReviewStep";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

/** 어떤 필지·종류·건물을 진단 중인지 가리키는 값 */
const keyOf = (s: ReviewSource) => `${s.land.pnu}|${s.mode}|${s.building?.id ?? ""}`;

export function DiagnoseFlow({ type }: { type: "land" | "building" }) {
  const [step, setStep] = useState<Step>(1);
  const [source, setSource] = useState<ReviewSource | null>(null);
  const [reviewed, setReviewed] = useState<ReviewedValues | null>(null);
  const [answers, setAnswers] = useState<QuestionAnswers | null>(null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [valueText, setValueText] = useState(""); // 건물 시가표준액 입력 글자

  // 제안서 단계로 보낼 요청: 값이 바뀔 때만 새로 만든다 (바뀌지 않으면 서버를 다시 부르지 않음)
  const proposalRequest = useMemo(
    () =>
      reviewed && answers && theme
        ? buildProposalRequest(reviewed, answers, theme, parseStandardValue(valueText).value)
        : null,
    [reviewed, answers, theme, valueText],
  );
  // 같은 요청이면 받아 둔 제안서 결과를 다시 쓴다 (돌아갔다 와도 AI 문장을 또 만들지 않음). 다른 필지·값이면 버린다.
  const proposalKey = proposalRequest ? JSON.stringify(proposalRequest) : "";
  const [proposalCache, setProposalCache] = useState<{ key: string; data: ProposalData } | null>(null);
  // 시뮬레이션 이미지는 같은 요청·같은 사진일 때만 다시 쓴다 (다시 만들면 하루 횟수를 또 쓰므로)
  const [imageCache, setImageCache] = useState<{ key: string; img: { src: string; remaining: number | null } } | null>(null);

  // 단계가 바뀌면 화면 맨 위로
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  // 같은 필지·같은 종류·같은 건물이면 같은 화면(고친 값·답 유지), 다르면 새로 시작
  const flowKey = source ? keyOf(source) : "";

  return (
    <>
      <div hidden={step !== 1}>
        <AddressStep
          type={type}
          onNext={(s) => {
            // 같은 필지·종류·건물로 다시 "다음"을 누른 것이면 이전에 고친 값·답을 그대로 둔다.
            // 다른 것을 골랐으면 이전에 확인한 값·답은 버린다.
            if (keyOf(s) !== flowKey) {
              setSource(s);
              setReviewed(null);
              setAnswers(null);
              releasePhoto(photo); // 다른 필지면 이전 사진은 버린다
              setPhoto(null);
              setTheme(null);
              setValueText("");
            }
            setStep(2);
          }}
        />
      </div>

      {source && (
        <div hidden={step !== 2}>
          <ReviewStep
            key={flowKey}
            source={source}
            onBack={() => setStep(1)}
            onNext={(r) => {
              setReviewed(r);
              setStep(3);
            }}
          />
        </div>
      )}

      {reviewed && (
        <div hidden={step !== 3}>
          <QuestionStep
            key={flowKey}
            reviewed={reviewed}
            onBack={() => setStep(2)}
            onSubmit={(a) => {
              setAnswers(a);
              setStep(4);
            }}
          />
        </div>
      )}

      {step === 4 && reviewed && answers && (
        <ResultStep reviewed={reviewed} answers={answers} onBack={() => setStep(3)} onNext={() => setStep(5)} />
      )}

      {/* 🟢 판정 결과에서만 올 수 있다. 결과 화면으로 돌아가도 고른 사진은 남는다 */}
      {step === 5 && reviewed && answers && (
        <PhotoStep
          type={reviewed.mode}
          zone={reviewed.zone}
          photo={photo}
          onPhotoChange={setPhoto}
          theme={theme}
          onThemeChange={setTheme}
          valueText={valueText}
          onValueTextChange={setValueText}
          onNext={() => setStep(6)}
          onBack={() => setStep(4)}
        />
      )}

      {step === 6 && proposalRequest && photo && reviewed && (
        <ProposalStep
          reviewed={reviewed}
          key={`${proposalKey}|${photo.previewUrl}`}
          request={proposalRequest}
          photo={photo}
          cachedImage={imageCache?.key === `${proposalKey}|${photo.previewUrl}` ? imageCache.img : null}
          onImage={(img) => setImageCache({ key: `${proposalKey}|${photo.previewUrl}`, img })}
          cached={proposalCache?.key === proposalKey ? proposalCache.data : null}
          onLoaded={(data) => setProposalCache({ key: proposalKey, data })}
          onBack={() => setStep(5)}
        />
      )}
    </>
  );
}
