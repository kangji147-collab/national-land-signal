// Design Ref: §4.4 — 공공 API(브이월드·공공데이터포털) 호출과 응답 정리. 서버 코드에서만 불러온다.
// 이 파일에는 "① 주소 검색", "② 토지 정보 조회", "③ 건축물대장 조회"가 있다.
//
// 약속
//  - 호출마다 시간 제한(기본 10초). 시간 초과·오류·이상한 응답은 모두 UpstreamError 로 바꾼다.
//    (오류 메시지에는 키·주소 같은 값을 넣지 않는다)
//  - 브이월드 응답은 그대로 브라우저에 넘기지 않고 필요한 항목만 정리해서 돌려준다.
//  - 외부 호출(fetch)과 키는 바깥에서 바꿔 끼울 수 있게 해서, 시험에서는 기록해 둔 실제 응답을 쓴다.

import { normalizeZoneName } from "./normalize-zone";

const VWORLD_SEARCH_URL = "https://api.vworld.kr/req/search";
const VWORLD_NED_URL = "https://api.vworld.kr/ned/data";
const DEFAULT_TIMEOUT_MS = 10_000;
export const MAX_CANDIDATES = 10;

/** 공공 API 오류·시간 초과·이상한 응답 (횟수를 돌려주고 "잠시 후 다시 시도" 안내가 필요한 경우) */
export class UpstreamError extends Error {
  constructor(what: string) {
    super(`공공 API 오류: ${what}`);
    this.name = "UpstreamError";
  }
}

export interface PublicApiDeps {
  fetcher?: typeof fetch;
  vworldKey?: string;
  vworldDomain?: string;
  /** 공공데이터포털(건축HUB) 인증키 */
  dataGoKey?: string;
  timeoutMs?: number;
}

/** 검색 결과에서 민원인이 고를 필지 한 개 */
export interface AddressCandidate {
  /** 필지 번호(PNU) 19자리 — 다음 단계 조회에 쓴다 */
  pnu: string;
  /** 화면에 크게 보여줄 주소 */
  label: string;
  /** 보조 설명 (예: "도로명: 세종대로 110"), 없으면 빈 글자 */
  detail: string;
  /** 건물 이름 (없으면 빈 글자) */
  buildingName: string;
}

export interface AddressSearchResult {
  candidates: AddressCandidate[];
  /** 검색에 걸린 전체 개수 (보여준 것보다 많으면 더 자세히 입력하라고 안내) */
  total: number;
}

type Category = "parcel" | "road";

interface RawItem {
  pnu: string;
  parcel: string;
  road: string;
  buildingName: string;
}

function config(deps: PublicApiDeps) {
  const key = deps.vworldKey ?? process.env.VWORLD_API_KEY;
  const domain = deps.vworldDomain ?? process.env.VWORLD_DOMAIN;
  // 설정 누락은 외부 오류가 아니라 우리 쪽 문제이므로 UpstreamError 가 아닌 일반 오류로 던진다.
  if (!key) throw new Error("환경 변수 VWORLD_API_KEY 값이 없어요");
  if (!domain) throw new Error("환경 변수 VWORLD_DOMAIN 값이 없어요");
  return { key, domain, fetcher: deps.fetcher ?? fetch, timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS };
}

// 글자는 앞뒤 공백을 다듬고(건축HUB 는 빈 이름을 " " 로 보낸다), 숫자는 글자로 바꿔 읽는다(건축HUB 는 숫자를 숫자로 보낸다).
const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";

/** 브이월드 검색 응답 한 건을 읽는다. 결과 없음은 빈 목록, 그 밖의 이상은 UpstreamError. */
function parseSearch(json: unknown): { total: number; items: RawItem[] } {
  const response = (json as { response?: Record<string, unknown> } | null)?.response;
  if (!response || typeof response !== "object") throw new UpstreamError("검색 응답 모양이 이상해요");

  const status = response.status;
  if (status === "NOT_FOUND") return { total: 0, items: [] };
  if (status !== "OK") throw new UpstreamError("검색 요청이 거절됐어요"); // INVALID_KEY 등 — 내용은 밖으로 내보내지 않음

  const total = Number((response.record as { total?: unknown } | undefined)?.total ?? 0);
  const rawItems = (response.result as { items?: unknown } | undefined)?.items;
  if (!Array.isArray(rawItems)) throw new UpstreamError("검색 결과 모양이 이상해요");

  const items: RawItem[] = [];
  for (const it of rawItems as Array<Record<string, unknown>>) {
    const pnu = str(it.id);
    if (!/^\d{19}$/.test(pnu)) continue; // 필지 번호가 아니면 건너뜀
    const address = (it.address ?? {}) as Record<string, unknown>;
    items.push({ pnu, parcel: str(address.parcel), road: str(address.road), buildingName: str(address.bldnm) });
  }
  return { total: Number.isFinite(total) ? total : items.length, items };
}

async function searchOne(query: string, category: Category, deps: PublicApiDeps) {
  const { key, domain, fetcher, timeoutMs } = config(deps);
  const url = new URL(VWORLD_SEARCH_URL);
  const params: Record<string, string> = {
    service: "search",
    request: "search",
    version: "2.0",
    crs: "EPSG:4326",
    size: String(MAX_CANDIDATES),
    page: "1",
    query,
    type: "address",
    category,
    format: "json",
    errorformat: "json",
    key,
    domain,
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new UpstreamError("검색 요청이 실패하거나 시간이 초과됐어요");
  }
  if (!res.ok) throw new UpstreamError(`검색 응답 HTTP ${res.status}`);

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new UpstreamError("검색 응답이 JSON 이 아니에요");
  }
  return parseSearch(json);
}

/**
 * 주소 글자로 필지 후보를 찾는다.
 * 지번 주소와 도로명 주소는 브이월드에서 따로 검색해야 하므로 두 가지를 동시에 찾아 합친다.
 *  - 같은 필지(PNU)는 한 번만 보여주고, 두 검색의 정보를 합쳐 전체 주소를 채운다.
 *  - 한쪽만 실패해도 다른 쪽 결과를 쓰고, 둘 다 실패하면 UpstreamError.
 *  - 결과가 없으면 빈 목록(호출한 쪽이 "주소를 찾을 수 없어요"로 안내).
 */
export async function searchAddress(rawQuery: string, deps: PublicApiDeps = {}): Promise<AddressSearchResult> {
  const query = rawQuery.trim().replace(/\s+/g, " ");
  const [parcel, road] = await Promise.allSettled([
    searchOne(query, "parcel", deps),
    searchOne(query, "road", deps),
  ]);

  if (parcel.status === "rejected" && road.status === "rejected") {
    // 외부 오류(UpstreamError)와 우리 쪽 설정 누락을 구분할 수 있도록 원래 오류를 그대로 던진다
    throw parcel.reason;
  }

  const acc = new Map<string, { parcelFull: string; parcelShort: string; roadFull: string; roadShort: string; bld: string }>();
  const touch = (pnu: string) => {
    let e = acc.get(pnu);
    if (!e) acc.set(pnu, (e = { parcelFull: "", parcelShort: "", roadFull: "", roadShort: "", bld: "" }));
    return e;
  };

  let total = 0;
  if (parcel.status === "fulfilled") {
    total = Math.max(total, parcel.value.total);
    for (const it of parcel.value.items) {
      const e = touch(it.pnu);
      e.parcelFull ||= it.parcel; // 지번 검색은 지번 주소가 전체 형태("서울특별시 중구 태평로1가 31")
      e.roadShort ||= it.road; // 도로명은 시·구가 빠진 짧은 형태("세종대로 110")
      e.bld ||= it.buildingName;
    }
  }
  if (road.status === "fulfilled") {
    total = Math.max(total, road.value.total);
    for (const it of road.value.items) {
      const e = touch(it.pnu);
      e.roadFull ||= it.road; // 도로명 검색은 도로명 주소가 전체 형태
      e.parcelShort ||= it.parcel; // 지번은 짧은 형태("태평로1가 31")
      e.bld ||= it.buildingName;
    }
  }

  const candidates: AddressCandidate[] = [];
  for (const [pnu, e] of acc) {
    if (candidates.length >= MAX_CANDIDATES) break;
    const label = e.parcelFull || e.roadFull || e.parcelShort || e.roadShort;
    if (!label) continue;
    const detail = e.parcelFull
      ? e.roadFull || e.roadShort
        ? `도로명: ${e.roadFull || e.roadShort}`
        : ""
      : e.parcelShort
        ? `지번: ${e.parcelShort}`
        : "";
    candidates.push({ pnu, label, detail, buildingName: e.bld });
  }

  // 전체 개수: 브이월드의 total 은 같은 필지(건물 이름만 다른 줄)를 따로 세므로 부풀 수 있다.
  // 받은 줄이 total 을 모두 채웠으면(잘리지 않았으면) 합친 뒤의 개수를 그대로 쓰고,
  // 잘렸으면(더 많은 결과가 남아 있으면) 브이월드가 알려 준 total 을 쓴다.
  const complete = [parcel, road].every((r) => r.status !== "fulfilled" || r.value.total <= r.value.items.length);
  return { candidates, total: complete ? acc.size : Math.max(total, acc.size) };
}

// =====================================================================
// ② 토지 정보 조회 (작업 10번) — 브이월드 데이터 API (/ned/data/…)
//   토지이용계획(지역지구) · 토지특성(지목·면적·용도지역) · 개별공시지가
// =====================================================================

/** 토지 6항목 (+ 판정에 쓰는 지역지구와 참고용 지역지구) */
export interface LandInfo {
  pnu: string;
  /** 소재지 — 예) 서울특별시 중구 태평로1가 31 (산 번지는 "산 1-1") */
  address: string;
  /** 지목 — 예) 대 */
  landCategory: string;
  /** 면적(㎡) */
  area: number;
  /** 용도지역 — 예) 일반상업지역. 지정되지 않았으면 빈 글자 */
  zone: string;
  /** 개별공시지가(원/㎡). 없으면 null → 화면에서 민원인이 직접 확인·입력 */
  officialPrice: number | null;
  officialPriceYear: number | null;
  /** 판정에 쓰는 지역·지구: "포함"·"저촉"인 것 (이름 정리됨, 용도지역과 같은 이름은 제외, 중복 없음) */
  zones: string[];
  /** 참고로만 보여주는 지역·지구: "접함"인 것 (판정에 쓰지 않음) */
  referenceZones: string[];
  /** 토지특성 기준 연도 */
  dataYear: number | null;
}

export type LandLookup = { found: true; info: LandInfo } | { found: false };

type Row = Record<string, unknown>;

const MAX_PAGES = 10; // 한 번에 100건씩, 최대 1,000건까지만 받는다 (이상한 응답으로 끝없이 호출하지 않게)
const PAGE_SIZE = 100;

/** NED 응답 한 쪽을 읽는다. 결과 없음은 빈 목록, 키 거절·이상한 모양은 UpstreamError. */
function parseNed(json: unknown): { rows: Row[]; total: number } {
  if (!json || typeof json !== "object") throw new UpstreamError("토지 응답 모양이 이상해요");
  const top = json as Record<string, unknown>;

  // 결과 없음: { response: { totalCount: "0", ... } }
  const response = top.response as Record<string, unknown> | undefined;
  if (response && typeof response === "object") {
    if (Number(response.totalCount) === 0) return { rows: [], total: 0 };
    throw new UpstreamError("토지 응답 모양이 이상해요");
  }

  // 정상·오류: { <이름>: { resultCode, resultMsg, totalCount, field: [...] } }
  const body = Object.values(top).find((v) => v && typeof v === "object") as Record<string, unknown> | undefined;
  if (!body) throw new UpstreamError("토지 응답 모양이 이상해요");
  // 성공이면 resultCode 가 비어 있다. INVALID_KEY 등은 내용을 밖으로 내보내지 않는다.
  if (str(body.resultCode)) throw new UpstreamError("토지 정보 요청이 거절됐어요");

  const field = body.field;
  const rows = (Array.isArray(field) ? field : field && typeof field === "object" ? [field] : []) as Row[];
  const total = Number(body.totalCount);
  return { rows, total: Number.isFinite(total) ? total : rows.length };
}

/** NED 한 종류를 모든 쪽 받아 온다. */
async function fetchNed(path: string, pnu: string, deps: PublicApiDeps): Promise<Row[]> {
  const { key, domain, fetcher, timeoutMs } = config(deps);
  const all: Row[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(`${VWORLD_NED_URL}/${path}`);
    const params: Record<string, string> = {
      pnu,
      format: "json",
      numOfRows: String(PAGE_SIZE),
      pageNo: String(page),
      key,
      domain,
    };
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    let res: Response;
    try {
      res = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new UpstreamError("토지 정보 요청이 실패하거나 시간이 초과됐어요");
    }
    if (!res.ok) throw new UpstreamError(`토지 정보 응답 HTTP ${res.status}`);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new UpstreamError("토지 정보 응답이 JSON 이 아니에요");
    }

    const { rows, total } = parseNed(json);
    all.push(...rows);
    if (rows.length === 0 || all.length >= total) break;
  }
  return all;
}

/** 연도별로 여러 건이 오는 줄 중 가장 최신 한 줄: 기준 연도 → 기준 월 → 마지막 수정일 순으로 비교 */
function latest(rows: Row[]): Row | undefined {
  const key = (r: Row) => `${str(r.stdrYear).padStart(4, "0")}|${str(r.stdrMt).padStart(2, "0")}|${str(r.lastUpdtDt)}`;
  return rows.reduce<Row | undefined>((best, r) => (best === undefined || key(r) > key(best) ? r : best), undefined);
}

const positive = (v: unknown): number | null => {
  const n = Number(str(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * 필지 번호(PNU)로 토지 6항목을 가져온다. (PRD must 1 규칙 4·5)
 *  - 연도별로 여러 건 오는 값은 최신 연도를 쓰고 기준 연도를 함께 돌려준다.
 *  - 지역지구는 "포함"·"저촉"만 판정용, "접함"은 참고용으로 나눈다. (모르는 값은 안전하게 판정용으로 본다)
 *  - 소재지나 면적을 가져오지 못하면 found:false (호출한 쪽이 "주소를 찾을 수 없어요"로 안내).
 *  - 호출 실패·시간 초과·키 거절은 UpstreamError.
 */
export async function lookupLand(pnu: string, deps: PublicApiDeps = {}): Promise<LandLookup> {
  if (!/^\d{19}$/.test(pnu)) throw new Error("필지 번호(PNU)는 숫자 19자리여야 해요");

  const [landUses, characteristics, prices] = await Promise.all([
    fetchNed("getLandUseAttr", pnu, deps),
    fetchNed("getLandCharacteristics", pnu, deps),
    fetchNed("getIndvdLandPriceAttr", pnu, deps),
  ]);

  const char = latest(characteristics);
  if (!char) return { found: false };

  const area = positive(char.lndpclAr);
  const ldCodeNm = str(char.ldCodeNm) || str(landUses[0]?.ldCodeNm) || str(prices[0]?.ldCodeNm);
  const lot = str(char.mnnmSlno);
  if (area === null || !ldCodeNm || !lot) return { found: false };

  // 소재지: 법정동 이름 + (산이면 "산 ") + 번지. 대지구분은 PNU 11번째 자리(1 일반, 2 산)
  const address = `${ldCodeNm} ${pnu[10] === "2" ? "산 " : ""}${lot}`;

  const zoneRaw = str(char.prposArea1Nm);
  const zone = zoneRaw === "지정되지않음" ? "" : zoneRaw;

  const price = latest(prices);
  const priceValue = price ? positive(price.pblntfPclnd) : null;

  const ownZone = normalizeZoneName(zone);
  const judged: string[] = [];
  const reference: string[] = [];
  for (const row of landUses) {
    const name = normalizeZoneName(str(row.prposAreaDstrcCodeNm));
    if (!name || name === ownZone) continue; // 용도지역은 따로 판정하므로 지역지구 목록에서 뺀다
    if (str(row.cnflcAtNm) === "접함") {
      if (!reference.includes(name)) reference.push(name);
    } else if (!judged.includes(name)) {
      judged.push(name); // "포함"·"저촉"·모르는 값 → 판정용 (확실하지 않으면 🟡 쪽으로)
    }
  }

  return {
    found: true,
    info: {
      pnu,
      address,
      landCategory: str(char.lndcgrCodeNm),
      area,
      zone,
      officialPrice: priceValue,
      officialPriceYear: priceValue !== null ? Number(str(price?.stdrYear)) || null : null,
      zones: judged,
      referenceZones: reference.filter((n) => !judged.includes(n)),
      dataYear: Number(str(char.stdrYear)) || null,
    },
  };
}

// =====================================================================
// ③ 건축물대장 조회 (작업 11번) — 공공데이터포털 국토교통부 건축HUB 표제부
//   주용도 · 연면적 · 층수 · 구조 · 사용승인일 (건물 5항목). 소유자 정보는 요청하지도, 가져오지도 않는다.
// =====================================================================

const BLDRGST_TITLE_URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";
/** 한 번에 받는 건물 수. 경복궁처럼 건물이 140개인 필지도 있어, 첫 100개만 받고 전체 개수를 함께 돌려준다. */
export const MAX_BUILDINGS = 100;

/** 건물 한 동 (표제부 한 줄) */
export interface BuildingInfo {
  /** 관리건축물대장 번호(없으면 순번) — 화면에서 동을 고를 때 쓴다 */
  id: string;
  /** 화면에 보여줄 이름: "신관 · 서울특별시 청사", 이름이 모두 없으면 "건물 2" */
  label: string;
  name: string;
  dong: string;
  /** 부속건축물이면 true (주건축물은 false) */
  isAnnex: boolean;
  /** 주용도 — 예) 업무시설 */
  mainPurpose: string;
  /** 연면적(㎡). 없으면 null → 화면에서 민원인이 직접 확인·입력 */
  totalFloorArea: number | null;
  floorsAbove: number | null;
  floorsBelow: number | null;
  /** 구조 — 예) 철골철근콘크리트구조 */
  structure: string;
  /** 사용승인일 "YYYY-MM-DD" (모르면 빈 글자) */
  approvalDate: string;
}

export interface BuildingLookup {
  buildings: BuildingInfo[];
  /** 건축물대장에 있는 전체 동 수 (보여준 것보다 많을 수 있음) */
  total: number;
}

function dataGoConfig(deps: PublicApiDeps) {
  const key = deps.dataGoKey ?? process.env.DATA_GO_KR_API_KEY;
  // 설정 누락은 외부 오류가 아니라 우리 쪽 문제이므로 UpstreamError 가 아닌 일반 오류로 던진다.
  if (!key) throw new Error("환경 변수 DATA_GO_KR_API_KEY 값이 없어요");
  return { key, fetcher: deps.fetcher ?? fetch, timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS };
}

const intOrNull = (v: unknown): number | null => {
  const s = str(v);
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** "20120831" → "2012-08-31". 8자리 숫자가 아니면 빈 글자 */
function formatApproval(v: unknown): string {
  const s = str(v).replace(/\D/g, "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : "";
}

/** 표제부 응답 한 쪽을 읽는다. 결과 없음은 빈 목록, 오류·이상한 모양은 UpstreamError. */
function parseBldrgst(json: unknown): { rows: Row[]; total: number } {
  const response = (json as { response?: Record<string, unknown> } | null)?.response;
  const header = response?.header as Record<string, unknown> | undefined;
  const body = response?.body as Record<string, unknown> | undefined;
  if (!header || !body) throw new UpstreamError("건축물대장 응답 모양이 이상해요");

  const code = str(header.resultCode);
  if (code === "03") return { rows: [], total: 0 }; // NODATA_ERROR: 결과 없음
  if (code !== "00") throw new UpstreamError("건축물대장 요청이 거절됐어요"); // 인증키 오류 등 — 내용은 밖으로 내보내지 않음

  // items 는 건물이 없으면 "" 이거나 {item: []}, 한 동이면 {item: {...}}, 여러 동이면 {item: [...]} 로 온다
  const items = body.items;
  const item = items && typeof items === "object" ? (items as Record<string, unknown>).item : undefined;
  const rows = (Array.isArray(item) ? item : item && typeof item === "object" ? [item] : []) as Row[];
  const total = Number(body.totalCount);
  return { rows, total: Number.isFinite(total) ? total : rows.length };
}

/**
 * 필지 번호(PNU)로 건축물대장(표제부)의 건물 목록을 가져온다. (PRD must 1 규칙 4·6)
 *  - PNU 를 시군구(5)·법정동(5)·대지구분(1)·본번(4)·부번(4)으로 나눠 요청한다. (대지구분 2=산 → 건축HUB 는 1)
 *  - 건물이 없으면 빈 목록 (호출한 쪽이 "이 주소에는 건축물대장이 없어요"로 안내).
 *  - 호출 실패·시간 초과·키 거절은 UpstreamError.
 *  - 소유자 필드는 응답에 있어도 읽지 않고 돌려주지 않는다. (필요한 5항목만 골라서 정리)
 */
export async function lookupBuildings(pnu: string, deps: PublicApiDeps = {}): Promise<BuildingLookup> {
  if (!/^\d{19}$/.test(pnu)) throw new Error("필지 번호(PNU)는 숫자 19자리여야 해요");
  const { key, fetcher, timeoutMs } = dataGoConfig(deps);

  const url = new URL(BLDRGST_TITLE_URL);
  const params: Record<string, string> = {
    sigunguCd: pnu.slice(0, 5),
    bjdongCd: pnu.slice(5, 10),
    platGbCd: pnu[10] === "2" ? "1" : "0",
    bun: pnu.slice(11, 15),
    ji: pnu.slice(15, 19),
    _type: "json",
    numOfRows: String(MAX_BUILDINGS),
    pageNo: "1",
    serviceKey: key,
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new UpstreamError("건축물대장 요청이 실패하거나 시간이 초과됐어요");
  }
  if (!res.ok) throw new UpstreamError(`건축물대장 응답 HTTP ${res.status}`); // 틀린 인증키는 403
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new UpstreamError("건축물대장 응답이 JSON 이 아니에요");
  }

  const { rows, total } = parseBldrgst(json);
  const buildings: BuildingInfo[] = rows.map((r, i) => {
    const name = str(r.bldNm); // 이름이 공백 한 칸(" ")으로 오는 경우가 있어 str 이 다듬는다
    const dong = str(r.dongNm);
    return {
      id: str(r.mgmBldrgstPk) || `row-${i + 1}`,
      label: name && dong ? `${dong} · ${name}` : name || dong || `건물 ${i + 1}`,
      name,
      dong,
      isAnnex: str(r.mainAtchGbCdNm) === "부속건축물",
      mainPurpose: str(r.mainPurpsCdNm),
      totalFloorArea: positive(r.totArea),
      floorsAbove: intOrNull(r.grndFlrCnt),
      floorsBelow: intOrNull(r.ugrndFlrCnt),
      structure: str(r.strctCdNm),
      approvalDate: formatApproval(r.useAprDay),
    };
  });
  return { buildings, total: Math.max(total, buildings.length) };
}
