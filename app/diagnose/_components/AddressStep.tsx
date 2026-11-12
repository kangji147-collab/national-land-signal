"use client";
// Design Ref: §3.2 — ① 주소 입력·필지 선택, "정보 가져오기", 건물 동 선택, 그리고 조회 예외 처리 (작업 12번)
// 입력한 주소는 이 화면(브라우저)과 /api/address-search·/api/lookup 에서만 쓰고 어디에도 저장하지 않는다.
// 가져온 값은 읽기 전용 카드로 보여주고, "다음"을 누르면 확인·수정 화면(ReviewStep)으로 값을 넘긴다.
//
// 예외 처리 (PRD must 1 규칙 5·6, 시험: tests/error-info.test.ts)
//  - 주소·정보·건축물대장을 못 찾으면 진행을 멈추고 안내한다. (다시 시도 버튼 없음, 찾는 요령을 알려 줌)
//  - 공공 API 오류·시간 초과·인터넷 끊김은 "다시 시도" 버튼을 보여주고, 실패한 조회는 횟수가 차감되지 않는다고 알려 준다.
//  - 건축물대장이 없으면, 이미 가져온 토지 정보로 토지 진단을 이어갈 수 있다. (조회 횟수를 또 쓰지 않음)
//  - 오늘 횟수를 모두 썼으면 해당 버튼을 막고 안내한다.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MESSAGES } from "@/lib/messages";
import type { AddressCandidate, BuildingInfo, LandInfo } from "@/lib/public-api";
import type { ReviewSource } from "@/lib/review";
import { type UiError, callApi } from "./api-client";
import { ErrorNotice } from "./ErrorNotice";
import { StepBar } from "./StepBar";

type Phase = "idle" | "loading" | "done" | "error";
interface UsageInfo {
  limit: number;
  remaining: number;
}
interface Usage {
  read: UsageInfo;
  search: UsageInfo;
}
const SEARCH_TIMEOUT_MS = 15_000; // 서버가 외부 호출에 쓰는 10초보다 조금 길게
const LOOKUP_TIMEOUT_MS = 30_000;

const won = (n: number) => n.toLocaleString("ko-KR");

export function AddressStep({
  type,
  onNext,
}: {
  type: "land" | "building";
  /** 가져온 값을 들고 다음 단계(확인·수정)로 간다 */
  onNext: (source: ReviewSource) => void;
}) {
  // 건물 진단에서 건축물대장이 없을 때 "토지 진단으로 진행"하면 mode 가 land 로 바뀐다
  const [mode, setMode] = useState<"land" | "building">(type);
  const [query, setQuery] = useState("");
  const [searchPhase, setSearchPhase] = useState<Phase>("idle");
  const [searchError, setSearchError] = useState<UiError | null>(null);
  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [lookupPhase, setLookupPhase] = useState<Phase>("idle");
  const [lookupError, setLookupError] = useState<UiError | null>(null);
  const [land, setLand] = useState<LandInfo | null>(null);
  // 건물 진단일 때만: 같은 필지의 건물(동) 목록과, 민원인이 고른 동
  const [buildings, setBuildings] = useState<BuildingInfo[] | null>(null);
  const [buildingsTotal, setBuildingsTotal] = useState<number | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [switchedToLand, setSwitchedToLand] = useState(false);
  const searchCtl = useRef<AbortController | null>(null);
  const lookupCtl = useRef<AbortController | null>(null);

  // 오늘 남은 횟수 (실패하면 조용히 숨김)
  const refreshUsage = useCallback(() => {
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const d = j?.data;
        if (d?.read && d?.search) {
          setUsage({
            read: { limit: d.read.limit, remaining: d.read.remaining },
            search: { limit: d.search.limit, remaining: d.search.remaining },
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshUsage();
    return () => {
      searchCtl.current?.abort();
      lookupCtl.current?.abort();
    };
  }, [refreshUsage]);

  // 횟수를 모두 쓴 경우: 서버가 거절했거나(LIMIT_EXCEEDED), 남은 횟수가 0으로 알려진 경우 버튼을 막는다
  const searchBlocked = searchError?.code === "LIMIT_EXCEEDED" || usage?.search.remaining === 0;
  const lookupBlocked = lookupError?.code === "LIMIT_EXCEEDED" || usage?.read.remaining === 0;

  function resetLookup() {
    lookupCtl.current?.abort();
    setLookupPhase("idle");
    setLookupError(null);
    setLand(null);
    setBuildings(null);
    setBuildingsTotal(null);
    setSelectedBuilding(null);
    setSwitchedToLand(false);
  }

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (searchBlocked || searchPhase === "loading") return;
    const q = query.trim();
    if (q.length < 2) {
      setSearchPhase("error");
      setSearchError({ code: "VALIDATION_ERROR", message: "주소를 2글자 이상 입력해 주세요" });
      return;
    }

    searchCtl.current?.abort(); // 이전 검색은 취소
    const ctl = new AbortController();
    searchCtl.current = ctl;
    setSearchPhase("loading");
    setSearchError(null);
    setCandidates([]);
    setSelected(null);
    resetLookup();

    const r = await callApi(`/api/address-search?q=${encodeURIComponent(q)}`, {}, SEARCH_TIMEOUT_MS, ctl.signal);
    if (r.kind === "aborted") return;
    if (r.kind === "error") {
      setSearchPhase("error");
      setSearchError(r.error);
    } else {
      const d = r.data as { candidates: AddressCandidate[]; total: number };
      setCandidates(d.candidates);
      setTotal(d.total);
      setSearchPhase("done");
    }
    refreshUsage(); // 이 검색이 횟수를 썼거나 돌려받았을 수 있으니 남은 횟수를 새로 읽는다
  }

  // 정보 가져오기: 이 순간 주소 조회 1회가 차감된다 (공공 API 오류·시간 초과면 서버가 돌려준다)
  async function fetchLand(pnu: string) {
    if (lookupPhase === "loading" || lookupBlocked) return; // 두 번 눌러 2회가 차감되지 않게
    lookupCtl.current?.abort();
    const ctl = new AbortController();
    lookupCtl.current = ctl;
    setLookupPhase("loading");
    resetLookupResult();

    const r = await callApi(
      "/api/lookup",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pnu, type: mode }) },
      LOOKUP_TIMEOUT_MS,
      ctl.signal,
    );
    if (r.kind === "aborted") return;
    if (r.kind === "error") {
      setLookupPhase("error");
      setLookupError(r.error);
    } else {
      const d = r.data as { land: LandInfo; buildings: BuildingInfo[] | null; buildingsTotal: number | null };
      setLand(d.land);
      setBuildings(d.buildings);
      setBuildingsTotal(d.buildingsTotal);
      // 건물이 한 동뿐이면 따로 고르지 않아도 되게 미리 선택해 둔다
      setSelectedBuilding(d.buildings && d.buildings.length === 1 ? d.buildings[0].id : null);
      setLookupPhase("done");
    }
    refreshUsage(); // 남은 횟수 갱신
  }

  function resetLookupResult() {
    setLookupError(null);
    setLand(null);
    setBuildings(null);
    setBuildingsTotal(null);
    setSelectedBuilding(null);
    setSwitchedToLand(false);
  }

  // 건축물대장이 없는 필지: 이미 받은 토지 정보로 토지 진단을 이어간다 (조회 횟수를 더 쓰지 않음)
  function continueAsLand(info: LandInfo) {
    setMode("land");
    setLookupError(null);
    setLand(info);
    setBuildings(null);
    setBuildingsTotal(null);
    setSelectedBuilding(null);
    setSwitchedToLand(true);
    setLookupPhase("done");
  }

  const chosen = candidates.find((c) => c.pnu === selected) ?? null;
  const typeLabel = mode === "land" ? "🌳 토지 진단" : "🏢 건물 진단";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:py-10">
      <StepBar current={1} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{typeLabel}</h1>
        <Link
          href="/"
          className="text-sm text-zinc-600 underline underline-offset-4 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← 처음으로
        </Link>
      </div>

      <form onSubmit={search} className="flex flex-col gap-3" noValidate>
        <label htmlFor="address" className="text-lg font-semibold">
          주소
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="address"
            name="address"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
            autoComplete="off"
            placeholder="예) 서울특별시 중구 태평로1가 31"
            aria-describedby="address-help"
            className="min-h-12 flex-1 rounded-xl border-2 border-zinc-300 bg-white px-4 text-base focus-visible:border-sky-600 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={searchPhase === "loading" || searchBlocked}
            className="min-h-12 rounded-xl bg-zinc-900 px-6 text-base font-semibold text-white hover:bg-zinc-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {searchPhase === "loading" ? "찾는 중…" : "검색"}
          </button>
        </div>
        <p id="address-help" className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          지번 주소(예: 태평로1가 31)나 도로명 주소(예: 세종대로 110)를 입력해 주세요. 건물 이름만으로는 찾을 수 없어요.
        </p>
      </form>

      {usage && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          오늘 주소 조회 남은 횟수: {usage.read.limit}회 중 <strong className="font-semibold">{usage.read.remaining}회</strong>
        </p>
      )}

      {/* 검색 횟수를 모두 쓴 경우: 서버가 거절한 때는 아래 오류 상자가 같은 문구를 보여주므로 한 번만 보이게 한다 */}
      {searchBlocked && searchError?.code !== "LIMIT_EXCEEDED" && (
        <ErrorNotice error={{ code: "LIMIT_EXCEEDED", message: MESSAGES.searchLimit }} />
      )}

      {searchPhase === "error" && searchError && (
        <ErrorNotice error={searchError} onRetry={() => search()} />
      )}

      <div aria-live="polite">
        {searchPhase === "done" && candidates.length > 0 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-lg font-semibold">검색 결과 (1개를 고르세요)</legend>
            {total > candidates.length && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                결과가 많아요. 시·구·동까지 함께 적으면 더 정확하게 찾을 수 있어요.
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {candidates.map((c) => (
                <li key={c.pnu}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 ${
                      selected === c.pnu
                        ? "border-sky-600 bg-sky-50 dark:bg-sky-950/40"
                        : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="parcel"
                      value={c.pnu}
                      checked={selected === c.pnu}
                      onChange={() => {
                        setSelected(c.pnu);
                        resetLookup(); // 다른 필지를 고르면 이전에 가져온 정보는 지운다
                      }}
                      className="mt-1 size-5 accent-sky-600"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-base font-semibold">{c.label}</span>
                      {c.detail && <span className="text-sm text-zinc-600 dark:text-zinc-400">{c.detail}</span>}
                      {c.buildingName && (
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">건물: {c.buildingName}</span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
      </div>

      {chosen && (
        <section className="flex flex-col gap-3 rounded-xl border border-zinc-300 p-4 dark:border-zinc-700" aria-label="선택한 필지">
          <p className="text-base">
            선택한 필지: <strong className="font-semibold">{chosen.label}</strong>
          </p>
          <button
            type="button"
            onClick={() => fetchLand(chosen.pnu)}
            disabled={lookupPhase === "loading" || lookupBlocked}
            className="min-h-12 self-start rounded-xl bg-zinc-900 px-6 text-base font-semibold text-white hover:bg-zinc-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {lookupPhase === "loading" ? "공공 정보를 가져오고 있어요…" : "정보 가져오기"}
          </button>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            누르면 오늘 주소 조회 횟수가 1회 사용돼요. (공공 API 오류로 실패하면 차감되지 않아요)
          </p>
        </section>
      )}

      {/* 조회 횟수를 모두 쓴 경우: 서버가 거절한 때는 아래 오류 상자가 같은 문구를 보여주므로 한 번만 보이게 한다 */}
      {chosen && lookupBlocked && lookupError?.code !== "LIMIT_EXCEEDED" && (
        <ErrorNotice error={{ code: "LIMIT_EXCEEDED", message: MESSAGES.readLimit }} />
      )}

      {lookupPhase === "error" && lookupError && (
        <ErrorNotice error={lookupError} onRetry={chosen ? () => fetchLand(chosen.pnu) : undefined}>
          {lookupError.code === "NO_BUILDING_REGISTER" && lookupError.land && (
            <button
              type="button"
              onClick={() => continueAsLand(lookupError.land as LandInfo)}
              className="min-h-11 rounded-lg border-2 border-zinc-900 px-4 text-sm font-semibold hover:bg-zinc-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-zinc-100 dark:hover:bg-zinc-800"
            >
              토지 진단으로 진행하기
            </button>
          )}
        </ErrorNotice>
      )}

      {land && (
        <section aria-label="가져온 토지 정보" className="flex flex-col gap-3 rounded-xl border-2 border-sky-600 p-4">
          <h2 className="text-lg font-semibold">가져온 토지 정보</h2>
          {switchedToLand && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">건축물대장이 없어 토지 진단으로 이어가요.</p>
          )}
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-base">
            <dt className="text-zinc-600 dark:text-zinc-400">소재지</dt>
            <dd className="font-medium">{land.address}</dd>
            <dt className="text-zinc-600 dark:text-zinc-400">지목</dt>
            <dd className="font-medium">{land.landCategory || "확인 필요"}</dd>
            <dt className="text-zinc-600 dark:text-zinc-400">면적</dt>
            <dd className="font-medium">{land.area.toLocaleString("ko-KR")}㎡</dd>
            <dt className="text-zinc-600 dark:text-zinc-400">개별공시지가</dt>
            <dd className="font-medium">
              {land.officialPrice !== null ? (
                <>
                  {won(land.officialPrice)}원/㎡ <span className="text-sm font-normal text-zinc-600 dark:text-zinc-400">({land.officialPriceYear}년 기준)</span>
                </>
              ) : (
                "확인 필요"
              )}
            </dd>
            <dt className="text-zinc-600 dark:text-zinc-400">용도지역</dt>
            <dd className="font-medium">{land.zone || "지정되지 않음"}</dd>
            <dt className="text-zinc-600 dark:text-zinc-400">다른 법령 지역·지구</dt>
            <dd>
              {land.zones.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {land.zones.map((z) => (
                    <li key={z} className="rounded-full bg-zinc-200 px-3 py-1 text-sm dark:bg-zinc-800">
                      {z}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-zinc-600 dark:text-zinc-400">없음</span>
              )}
              {land.referenceZones.length > 0 && (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  참고(판정에 쓰이지 않음): {land.referenceZones.join(" · ")}
                </p>
              )}
            </dd>
          </dl>
        </section>
      )}

      {land && mode === "building" && buildings && (
        <section aria-label="건물 정보" className="flex flex-col gap-3 rounded-xl border-2 border-sky-600 p-4">
          <h2 className="text-lg font-semibold">건물 정보 (건축물대장)</h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-base font-medium">
              {buildings.length > 1 ? `이 필지에는 건물이 여러 동 있어요. 1개를 고르세요` : "이 필지의 건물이에요"}
            </legend>
            {buildingsTotal !== null && buildingsTotal > buildings.length && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                건물이 많아요. 전체 {buildingsTotal}개 중 {buildings.length}개만 보여줘요.
              </p>
            )}
            <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
              {buildings.map((b) => (
                <li key={b.id}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 ${
                      selectedBuilding === b.id
                        ? "border-sky-600 bg-sky-50 dark:bg-sky-950/40"
                        : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="building"
                      value={b.id}
                      checked={selectedBuilding === b.id}
                      onChange={() => setSelectedBuilding(b.id)}
                      className="mt-1 size-5 accent-sky-600"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-base font-semibold">
                        {b.label}
                        {b.isAnnex && (
                          <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-normal dark:bg-zinc-800">
                            부속건축물
                          </span>
                        )}
                      </span>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        {[
                          b.mainPurpose,
                          b.totalFloorArea !== null ? `연면적 ${b.totalFloorArea.toLocaleString("ko-KR")}㎡` : null,
                          b.approvalDate ? `사용승인 ${b.approvalDate}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "상세 정보 없음"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          {(() => {
            const b = buildings.find((x) => x.id === selectedBuilding);
            if (!b) {
              return <p className="text-sm text-zinc-600 dark:text-zinc-400">건물을 하나 골라 주세요.</p>;
            }
            const floors =
              b.floorsAbove !== null || b.floorsBelow !== null
                ? `지상 ${b.floorsAbove ?? "?"}층 · 지하 ${b.floorsBelow ?? "?"}층`
                : "확인 필요";
            return (
              <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 border-t border-zinc-300 pt-3 text-base dark:border-zinc-700">
                <dt className="text-zinc-600 dark:text-zinc-400">주용도</dt>
                <dd className="font-medium">{b.mainPurpose || "확인 필요"}</dd>
                <dt className="text-zinc-600 dark:text-zinc-400">연면적</dt>
                <dd className="font-medium">
                  {b.totalFloorArea !== null ? `${b.totalFloorArea.toLocaleString("ko-KR")}㎡` : "확인 필요"}
                </dd>
                <dt className="text-zinc-600 dark:text-zinc-400">층수</dt>
                <dd className="font-medium">{floors}</dd>
                <dt className="text-zinc-600 dark:text-zinc-400">구조</dt>
                <dd className="font-medium">{b.structure || "확인 필요"}</dd>
                <dt className="text-zinc-600 dark:text-zinc-400">사용승인일</dt>
                <dd className="font-medium">{b.approvalDate || "확인 필요"}</dd>
              </dl>
            );
          })()}
        </section>
      )}

      {land && (
        <div className="flex flex-col gap-2">
          {(() => {
            const building = buildings?.find((x) => x.id === selectedBuilding) ?? null;
            const needBuilding = mode === "building" && !building;
            return (
              <>
                <button
                  type="button"
                  disabled={needBuilding}
                  onClick={() => onNext({ mode, land, building: mode === "building" ? building : null })}
                  className="min-h-12 self-start rounded-xl bg-zinc-900 px-6 text-base font-semibold text-white hover:bg-zinc-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  다음: 가져온 내용 확인하기
                </button>
                {needBuilding && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">건물을 하나 골라야 다음으로 갈 수 있어요.</p>
                )}
              </>
            );
          })()}
        </div>
      )}
    </main>
  );
}
