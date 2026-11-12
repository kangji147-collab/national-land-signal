"use client";
// Design Ref: §3.3 — ② 가져온 내용 확인·수정
// 가져온 값을 입력칸에 채워 보여주고, 민원인이 틀린 곳을 고친다. 고친 항목은 "✏️ 민원인이 수정한 값"으로 표시하고 기록한다.
// 값 검사·수정 기록·확정은 lib/review.ts (시험: tests/review.test.ts)가 한다. 이 화면은 보여주고 입력받기만 한다.
import { useId, useRef, useState } from "react";
import { MESSAGES } from "@/lib/messages";
import { normalizeZoneName } from "@/lib/normalize-zone";
import {
  EDITED_LABELS,
  type EditedKey,
  type ReviewForm,
  type ReviewSource,
  type ReviewedValues,
  editedKeys,
  initialForm,
  toReviewed,
  validate,
  warnings,
} from "@/lib/review";
import { StepBar } from "./StepBar";

const INPUT =
  "min-h-12 w-full rounded-sm border-2 border-zinc-300 bg-white px-4 text-base focus-visible:border-sky-600 focus-visible:outline-none aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-900";

// 수정 기록 항목 → 되돌릴 입력칸
const FIELDS_OF: Record<EditedKey, (keyof ReviewForm)[]> = {
  address: ["address"],
  landCategory: ["landCategory"],
  area: ["area"],
  officialPrice: ["officialPrice"],
  zone: ["zone"],
  zones: ["zones"],
  mainPurpose: ["mainPurpose"],
  totalFloorArea: ["totalFloorArea"],
  floors: ["floorsAbove", "floorsBelow"],
  structure: ["structure"],
  approvalDate: ["approvalDate"],
};

/** "✏️ 민원인이 수정한 값" 표시 + 처음 값으로 되돌리기 */
function EditedMark({ onReset }: { onReset?: () => void }) {
  return (
    <span className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
      <span>✏️ {MESSAGES.userEdited}</span>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="rounded px-1 underline underline-offset-2 hover:no-underline focus-visible:outline-3 focus-visible:outline-sky-600"
        >
          처음 값으로
        </button>
      )}
    </span>
  );
}

// ※ 화면 컴포넌트 "안"에서 정의하면 글자를 칠 때마다 입력칸이 새로 만들어져 커서가 사라지므로, 반드시 바깥에 둔다.
/** 입력칸 한 줄: 라벨 + 수정 표시 + 입력칸 + 오류/경고 */
function Field({
  id,
  label,
  value,
  onChange,
  inputMode,
  isEdited,
  onReset,
  error,
  warning,
  unit,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "decimal" | "numeric";
  isEdited?: boolean;
  onReset?: () => void;
  error?: string;
  warning?: string;
  unit?: string;
}) {
  const note = error ? `${id}-error` : warning ? `${id}-warn` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label htmlFor={id} className="text-base font-semibold">
          {label}
        </label>
        {isEdited && <EditedMark onReset={onReset} />}
      </div>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={note}
          className={INPUT}
        />
        {unit && <span className="shrink-0 text-sm text-zinc-600 dark:text-zinc-400">{unit}</span>}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {!error && warning && (
        <p id={`${id}-warn`} className="text-sm text-zinc-600 dark:text-zinc-400">
          {warning}
        </p>
      )}
    </div>
  );
}

export function ReviewStep({
  source,
  onBack,
  onNext,
}: {
  source: ReviewSource;
  onBack: () => void;
  onNext: (reviewed: ReviewedValues) => void;
}) {
  const { mode } = source;
  const [original] = useState(() => initialForm(source)); // "처음 값으로" 되돌릴 때 쓰는 가져온 그대로의 값
  const [form, setForm] = useState<ReviewForm>(original);
  const [newZone, setNewZone] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId();

  const errors = validate(form, mode);
  const warns = warnings(form, mode);
  const edited = new Set(editedKeys(source, form));

  const set = <K extends keyof ReviewForm>(key: K, value: ReviewForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const reset = (key: EditedKey) =>
    setForm((f) => {
      const next = { ...f };
      for (const k of FIELDS_OF[key]) (next as Record<string, unknown>)[k] = original[k];
      return next;
    });

  /** Field 에 넘길 공통 값: 칸 id, 입력값·바뀔 때, 수정 표시, 되돌리기 */
  const bind = (key: keyof ReviewForm & string, editedKey?: EditedKey, inputMode?: "decimal" | "numeric") => ({
    id: `${uid}-${key}`,
    value: form[key] as string,
    onChange: (v: string) => set(key, v as never),
    inputMode,
    isEdited: !!editedKey && edited.has(editedKey),
    onReset: editedKey ? () => reset(editedKey) : undefined,
  });

  function addZone() {
    const name = normalizeZoneName(newZone);
    if (!name) return;
    if (!form.zones.some((z) => normalizeZoneName(z) === name)) set("zones", [...form.zones, name]);
    setNewZone("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      // 첫 오류 칸으로 이동
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    onNext(toReviewed(source, form));
  }

  const editedList = [...edited].map((k) => EDITED_LABELS[k]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:py-10">
      <StepBar current={2} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-[var(--heading)]">가져온 내용을 확인하고, 틀리면 고쳐 주세요</h1>
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
          판정은 여기에 적힌 값으로만 해요. 고친 곳은 결과와 제안서에 &quot;{MESSAGES.userEdited}&quot;으로 표시돼요.
        </p>
      </div>

      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-6">
        <fieldset className="k-card flex flex-col gap-5">
          <legend className="px-2 text-lg font-semibold">토지 정보</legend>

          <Field {...bind("address", "address")} label="소재지" error={errors.address} />
          <Field {...bind("landCategory", "landCategory")} label="지목" warning={warns.landCategory} />
          <Field {...bind("area", "area", "decimal")} label="면적" error={errors.area} unit="㎡" />
          <Field
            {...bind("officialPrice", "officialPrice", "decimal")}
            label="개별공시지가"
            error={errors.officialPrice}
            warning={warns.officialPrice}
            unit="원/㎡"
          />
          {source.land.officialPriceYear !== null && (
            <p className="-mt-3 text-sm text-zinc-600 dark:text-zinc-400">공시지가 기준: {source.land.officialPriceYear}년</p>
          )}
          <Field {...bind("zone", "zone")} label="용도지역" warning={warns.zone} />

          {/* 다른 법령 지역·지구: 칩 목록 + 추가 */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-base font-semibold">다른 법령 지역·지구 (판정에 사용)</span>
              {edited.has("zones") && <EditedMark onReset={() => reset("zones")} />}
            </div>
            {form.zones.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {form.zones.map((z) => (
                  <li key={z} className="flex items-center gap-1 rounded-full bg-zinc-200 py-1 pl-3 pr-1 text-sm dark:bg-zinc-800">
                    {z}
                    <button
                      type="button"
                      aria-label={`${z} 빼기`}
                      onClick={() =>
                        set(
                          "zones",
                          form.zones.filter((x) => x !== z),
                        )
                      }
                      className="grid size-7 place-items-center rounded-full hover:bg-zinc-300 focus-visible:outline-3 focus-visible:outline-sky-600 dark:hover:bg-[var(--blue)]"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">없음</p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newZone}
                onChange={(e) => setNewZone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault(); // 이 칸에서 Enter 는 "추가"이지 "다음 단계"가 아니다
                    addZone();
                  }
                }}
                placeholder="빠진 지역·지구 이름"
                aria-label="추가할 지역·지구 이름"
                autoComplete="off"
                className={INPUT}
              />
              <button
                type="button"
                onClick={addZone}
                className="min-h-12 shrink-0 rounded-sm border-2 border-zinc-900 px-4 text-base font-semibold hover:bg-zinc-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-zinc-100 dark:hover:bg-zinc-800"
              >
                추가
              </button>
            </div>
            {source.land.referenceZones.length > 0 && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                참고(판정에 쓰이지 않음, 고칠 수 없어요): {source.land.referenceZones.join(" · ")}
              </p>
            )}
          </div>
        </fieldset>

        {mode === "building" && source.building && (
          <fieldset className="k-card flex flex-col gap-5">
            <legend className="px-2 text-lg font-semibold">건물 정보 (건축물대장)</legend>
            <p className="-mt-2 text-sm text-zinc-600 dark:text-zinc-400">{source.building.label}</p>

            <Field {...bind("mainPurpose", "mainPurpose")} label="주용도" />
            <Field
              {...bind("totalFloorArea", "totalFloorArea", "decimal")}
              label="연면적"
              error={errors.totalFloorArea}
              warning={warns.totalFloorArea}
              unit="㎡"
            />
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-base font-semibold">층수</span>
                {edited.has("floors") && <EditedMark onReset={() => reset("floors")} />}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field {...bind("floorsAbove", undefined, "numeric")} label="지상" error={errors.floorsAbove} unit="층" />
                <Field {...bind("floorsBelow", undefined, "numeric")} label="지하" error={errors.floorsBelow} unit="층" />
              </div>
            </div>
            <Field {...bind("structure", "structure")} label="구조" />
            <Field
              {...bind("approvalDate", "approvalDate")}
              label="사용승인일"
              error={errors.approvalDate}
              warning={warns.approvalDate}
            />
          </fieldset>
        )}

        {edited.size > 0 && (
          <p className="rounded-sm bg-amber-50 px-4 py-3 text-base text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
            ✏️ 고친 항목: <strong className="font-semibold">{editedList.join(", ")}</strong>
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="min-h-12 rounded-sm border-2 border-[var(--navy)] px-6 text-base font-semibold text-[var(--heading)] hover:bg-[var(--panel)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-[var(--blue)]"
          >
            ← 주소 다시 고르기
          </button>
          <button
            type="submit"
            className="min-h-12 rounded-sm bg-[var(--navy)] px-6 text-base font-semibold text-white hover:bg-[var(--blue)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:bg-[var(--blue)] dark:text-white dark:hover:bg-[#8aa4ff]"
          >
            다음: 질문에 답하기
          </button>
        </div>
        {Object.keys(errors).length > 0 && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            빨간 글씨로 표시된 칸을 고치면 다음으로 갈 수 있어요.
          </p>
        )}
      </form>
    </main>
  );
}
