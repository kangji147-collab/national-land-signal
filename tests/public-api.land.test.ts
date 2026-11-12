// 토지 정보 조회(lib/public-api.ts lookupLand) 시험: 2026-11-12에 브이월드에서 받아 둔 서울시청 부지의 실제 응답을 쓴다.
// 네트워크 접속 없음. 기대값은 기록한 응답을 눈으로 확인해 손으로 적은 값이다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UpstreamError, lookupLand } from "../lib/public-api";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"));

const USE = fixture("vworld-landuse-seoulcity.json");
const CHAR = fixture("vworld-landchar-seoulcity.json");
const PRICE = fixture("vworld-price-seoulcity.json");
const USE_NONE = fixture("vworld-landuse-none.json");
const CHAR_NONE = fixture("vworld-landchar-none.json");
const PRICE_NONE = fixture("vworld-price-none.json");
const BAD_KEY = fixture("vworld-ned-badkey.json");

const SEOUL = "1114010300100310000";
const KEY = "TEST-KEY-ABCDEF";
const deps = { vworldKey: KEY, vworldDomain: "localhost:3000" };

type Bodies = { use?: unknown; char?: unknown; price?: unknown };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

/** 주소 끝(getLandUseAttr / getLandCharacteristics / getIndvdLandPriceAttr)에 따라 정해 둔 응답을 돌려주는 가짜 fetch */
function fake(b: Bodies, record?: URL[]) {
  return (async (input: URL | string) => {
    const url = new URL(String(input));
    record?.push(url);
    const name = url.pathname.split("/").pop();
    const body = name === "getLandUseAttr" ? b.use : name === "getLandCharacteristics" ? b.char : b.price;
    return typeof body === "function" ? (body as (u: URL) => Response)(url) : json(body);
  }) as typeof fetch;
}

const seoul = (over: Bodies = {}) => fake({ use: USE, char: CHAR, price: PRICE, ...over });

describe("토지 정보 조회 — 서울시청 부지 (실제 응답)", () => {
  it("토지 6항목이 맞게 나온다 (최신 연도 값)", async () => {
    const r = await lookupLand(SEOUL, { ...deps, fetcher: seoul() });
    expect(r.found).toBe(true);
    if (!r.found) return;
    expect(r.info).toMatchObject({
      pnu: SEOUL,
      address: "서울특별시 중구 태평로1가 31",
      landCategory: "대",
      area: 12709.4,
      zone: "일반상업지역",
      officialPrice: 65730000, // 2026년 값 (2025년은 62,570,000원)
      officialPriceYear: 2026,
      dataYear: 2026,
    });
  });

  it("지역지구: '포함'·'저촉'만 판정용 — 이름 정리(괄호·공백), 용도지역과 같은 이름 제외, 중복 제거", async () => {
    const r = await lookupLand(SEOUL, { ...deps, fetcher: seoul() });
    if (!r.found) throw new Error("조회 실패");
    expect(r.info.zones).toEqual([
      "대공방어협조구역", // "대공방어협조구역(위탁고도:77-257m)[포함]"
      "등록문화유산구역",
      "과밀억제권역",
      "역사문화환경보존지역",
      "토지거래계약에관한허가구역", // 3건이 와도 1번만
      "도로",
      "지하도로",
      "철도",
      "가축사육제한구역",
      "건축선",
      "제1종지구단위계획구역",
      "공공청사",
      "가로구역별최고높이제한지역", // 이름 안 공백 제거
      "중점경관관리구역",
      "서울도심",
    ]);
    expect(r.info.zones).not.toContain("일반상업지역"); // 용도지역은 따로 판정
  });

  it("'접함'은 참고로만: 광장은 참고, 도로는 '저촉'도 있어 판정용에만 있다", async () => {
    const r = await lookupLand(SEOUL, { ...deps, fetcher: seoul() });
    if (!r.found) throw new Error("조회 실패");
    expect(r.info.referenceZones).toEqual(["광장"]);
    expect(r.info.zones).not.toContain("광장");
    expect(r.info.zones).toContain("도로");
  });

  it("브이월드에 필요한 요청을 보낸다: 세 가지 API, 필지 번호·키·서비스 주소·100건씩", async () => {
    const urls: URL[] = [];
    await lookupLand(SEOUL, { ...deps, fetcher: fake({ use: USE, char: CHAR, price: PRICE }, urls) });
    expect(urls.map((u) => u.pathname.split("/").pop()).sort()).toEqual([
      "getIndvdLandPriceAttr",
      "getLandCharacteristics",
      "getLandUseAttr",
    ]);
    for (const u of urls) {
      expect(u.origin).toBe("https://api.vworld.kr");
      expect(u.pathname.startsWith("/ned/data/")).toBe(true);
      expect(u.searchParams.get("pnu")).toBe(SEOUL);
      expect(u.searchParams.get("key")).toBe(KEY);
      expect(u.searchParams.get("domain")).toBe("localhost:3000");
      expect(u.searchParams.get("numOfRows")).toBe("100");
    }
  });

  it("산 번지는 소재지에 '산'을 붙인다 (PNU 11번째 자리 2)", async () => {
    const SAN = "1114010300200310000";
    const r = await lookupLand(SAN, { ...deps, fetcher: seoul() });
    if (!r.found) throw new Error("조회 실패");
    expect(r.info.address).toBe("서울특별시 중구 태평로1가 산 31");
  });
});

describe("토지 정보 조회 — 값이 비었거나 특이한 경우", () => {
  const charWith = (mut: (row: Record<string, string>) => void) => {
    const c = structuredClone(CHAR);
    mut(c.landCharacteristicss.field.at(-1)); // 가장 최신 줄을 바꾼다
    return c;
  };

  it("없는 필지(세 API 모두 결과 0건)는 found:false", async () => {
    const r = await lookupLand("1114010300199990000", { ...deps, fetcher: fake({ use: USE_NONE, char: CHAR_NONE, price: PRICE_NONE }) });
    expect(r).toEqual({ found: false });
  });

  it("토지특성(면적)이 없으면 다른 정보가 있어도 found:false (PRD: 면적을 못 가져오면 멈춤)", async () => {
    const r = await lookupLand(SEOUL, { ...deps, fetcher: seoul({ char: CHAR_NONE }) });
    expect(r).toEqual({ found: false });
  });

  it("면적이 0이거나 비어 있으면 found:false", async () => {
    for (const ar of ["0", "", "abc"]) {
      const r = await lookupLand(SEOUL, { ...deps, fetcher: seoul({ char: charWith((row) => (row.lndpclAr = ar)) }) });
      expect(r, JSON.stringify(ar)).toEqual({ found: false });
    }
  });

  it("공시지가가 없으면 officialPrice 는 null (화면에서 민원인이 확인)", async () => {
    const r = await lookupLand(SEOUL, { ...deps, fetcher: seoul({ price: PRICE_NONE }) });
    if (!r.found) throw new Error("조회 실패");
    expect(r.info.officialPrice).toBeNull();
    expect(r.info.officialPriceYear).toBeNull();
    expect(r.info.area).toBe(12709.4); // 나머지는 정상
  });

  it("토지이용계획이 비어 있으면 지역지구 없음 (오류가 아님)", async () => {
    const r = await lookupLand(SEOUL, { ...deps, fetcher: seoul({ use: USE_NONE }) });
    if (!r.found) throw new Error("조회 실패");
    expect(r.info.zones).toEqual([]);
    expect(r.info.referenceZones).toEqual([]);
  });

  it("용도지역이 '지정되지않음'이면 빈 글자 (규칙표에서 🟡로 처리됨)", async () => {
    const r = await lookupLand(SEOUL, { ...deps, fetcher: seoul({ char: charWith((row) => (row.prposArea1Nm = "지정되지않음")) }) });
    if (!r.found) throw new Error("조회 실패");
    expect(r.info.zone).toBe("");
  });

  it("연도별 여러 줄 중 최신 연도 → 같은 연도면 최신 월 → 같으면 마지막 수정일이 가장 늦은 줄", async () => {
    const row = (y: string, m: string, upd: string, ar: string) => ({ ...CHAR.landCharacteristicss.field[0], stdrYear: y, stdrMt: m, lastUpdtDt: upd, lndpclAr: ar });
    const char = {
      landCharacteristicss: {
        ...CHAR.landCharacteristicss,
        field: [row("2024", "01", "2024-01-01", "1"), row("2025", "03", "2025-01-01", "2"), row("2025", "03", "2025-06-01", "3"), row("2025", "01", "2026-01-01", "4")],
      },
    };
    const r = await lookupLand(SEOUL, { ...deps, fetcher: seoul({ char }) });
    if (!r.found) throw new Error("조회 실패");
    expect(r.info.area).toBe(3);
  });

  it("지역지구 관계가 모르는 값이면 안전하게 판정용으로 본다", async () => {
    const use = structuredClone(USE);
    use.landUses.field[1].cnflcAtNm = "알수없음"; // 광장
    const r = await lookupLand(SEOUL, { ...deps, fetcher: seoul({ use }) });
    if (!r.found) throw new Error("조회 실패");
    expect(r.info.zones).toContain("광장");
    expect(r.info.referenceZones).not.toContain("광장");
  });

  it("지역지구가 한 줄만 와서 목록이 아니라 객체여도 읽는다", async () => {
    const use = { landUses: { ...USE.landUses, totalCount: "1", field: USE.landUses.field[0] } };
    const r = await lookupLand(SEOUL, { ...deps, fetcher: seoul({ use }) });
    if (!r.found) throw new Error("조회 실패");
    expect(r.info.zones).toEqual(["대공방어협조구역"]);
  });
});

describe("토지 정보 조회 — 여러 쪽 받기", () => {
  it("전체 개수가 100건을 넘으면 쪽을 넘기며 모두 받는다", async () => {
    const mk = (i: number) => ({ ...USE.landUses.field[0], prposAreaDstrcCodeNm: `지구${i}`, cnflcAtNm: "포함" });
    const pages: number[] = [];
    const use = (u: URL) => {
      const page = Number(u.searchParams.get("pageNo"));
      pages.push(page);
      const from = (page - 1) * 100;
      const count = Math.max(0, Math.min(100, 230 - from));
      return json({ landUses: { resultCode: "", totalCount: "230", numOfRows: "100", pageNo: String(page), field: Array.from({ length: count }, (_, k) => mk(from + k)) } });
    };
    const r = await lookupLand(SEOUL, { ...deps, fetcher: seoul({ use }) });
    if (!r.found) throw new Error("조회 실패");
    expect(pages).toEqual([1, 2, 3]);
    expect(r.info.zones).toHaveLength(230);
  });

  it("이상한 응답으로 끝없이 호출하지 않는다 (최대 10쪽)", async () => {
    let calls = 0;
    const use = () => {
      calls++;
      return json({ landUses: { resultCode: "", totalCount: "999999", field: [{ ...USE.landUses.field[0], prposAreaDstrcCodeNm: `지구${calls}` }] } });
    };
    await lookupLand(SEOUL, { ...deps, fetcher: seoul({ use }) });
    expect(calls).toBe(10);
  });
});

describe("토지 정보 조회 — 오류 처리", () => {
  const rejects = (b: Bodies) => expect(lookupLand(SEOUL, { ...deps, fetcher: seoul(b) })).rejects.toBeInstanceOf(UpstreamError);

  it("키가 거절되면(INVALID_KEY) UpstreamError — 오류 내용·키가 메시지에 나오지 않는다", async () => {
    const err = await lookupLand(SEOUL, { ...deps, fetcher: seoul({ char: BAD_KEY }) }).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(String(err.message)).not.toContain("INVALID_KEY");
    expect(String(err.message)).not.toContain(KEY);
  });

  it("세 가지 중 하나만 오류여도 UpstreamError (일부만 채운 결과로 판정하지 않는다)", async () => {
    await rejects({ price: BAD_KEY });
    await rejects({ use: () => json({}, 500) as unknown as Response } as unknown as Bodies);
  });

  it("JSON 이 아닌 응답·이상한 모양이면 UpstreamError", async () => {
    await rejects({ use: () => new Response("<html>점검 중</html>") } as unknown as Bodies);
    await rejects({ char: { foo: "bar" } });
    await rejects({ price: { response: { totalCount: "5" } } }); // 0건이 아닌데 응답 모양이 이상함
    await rejects({ use: null });
  });

  it("네트워크 오류·시간 초과면 UpstreamError", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(lookupLand(SEOUL, { ...deps, fetcher: down })).rejects.toBeInstanceOf(UpstreamError);

    const slow = (async (_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(new DOMException("timeout", "TimeoutError")));
      })) as typeof fetch;
    await expect(lookupLand(SEOUL, { ...deps, fetcher: slow, timeoutMs: 50 })).rejects.toBeInstanceOf(UpstreamError);
  });

  it("필지 번호가 19자리 숫자가 아니면 호출하지 않고 거절한다", async () => {
    for (const bad of ["", "123", "abc", "1114010300100310000x", "11140103001003100000"]) {
      await expect(lookupLand(bad, { ...deps, fetcher: seoul() })).rejects.toThrow("19자리");
    }
  });
});
