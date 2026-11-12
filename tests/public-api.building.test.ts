// 건축물대장 조회(lib/public-api.ts lookupBuildings) 시험: 2026-11-12에 공공데이터포털 건축HUB에서 받아 둔 서울시청 부지의 실제 응답을 쓴다.
// 네트워크 접속 없음. 기대값은 기록한 응답을 눈으로 확인해 손으로 적은 값이다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_BUILDINGS, UpstreamError, lookupBuildings } from "../lib/public-api";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"));

const SEOUL = fixture("bldrgst-title-seoulcity.json");
const NONE = fixture("bldrgst-title-none.json");

const PNU = "1114010300100310000";
const KEY = "TEST-KEY-ABCDEF";
const deps = { dataGoKey: KEY };

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const fake = (body: unknown | (() => Response), record?: URL[]) =>
  (async (input: URL | string) => {
    record?.push(new URL(String(input)));
    return typeof body === "function" ? (body as () => Response)() : json(body);
  }) as typeof fetch;

/** 응답 모양만 바꾼 가짜 응답 */
const envelope = (items: unknown, totalCount: number, resultCode = "00") => ({
  response: { header: { resultCode, resultMsg: "X" }, body: { items, totalCount, numOfRows: 100, pageNo: 1 } },
});

describe("건축물대장 조회 — 서울시청 부지 (실제 응답)", () => {
  it("건물 두 동이 나오고, 5항목이 맞게 정리된다", async () => {
    const r = await lookupBuildings(PNU, { ...deps, fetcher: fake(SEOUL) });
    expect(r.total).toBe(2);
    expect(r.buildings).toHaveLength(2);

    expect(r.buildings[0]).toEqual({
      id: "10031100209993",
      label: "신관 · 서울특별시 청사",
      name: "서울특별시 청사",
      dong: "신관",
      isAnnex: false,
      mainPurpose: "업무시설",
      totalFloorArea: 83625.55,
      floorsAbove: 13,
      floorsBelow: 5,
      structure: "철골철근콘크리트구조",
      approvalDate: "2012-08-31",
    });
  });

  it("이름·동이 공백 한 칸(' ')으로 오는 건물은 '건물 N' 으로 표시한다 (지하 0층·옛 사용승인일도 정상)", async () => {
    const r = await lookupBuildings(PNU, { ...deps, fetcher: fake(SEOUL) });
    expect(r.buildings[1]).toMatchObject({
      id: "100311530",
      label: "건물 2",
      name: "",
      dong: "",
      mainPurpose: "업무시설",
      totalFloorArea: 9453.87,
      floorsAbove: 7,
      floorsBelow: 0, // 지하 0층은 값이 있는 것(0)이지 비어 있는 것(null)이 아니다
      structure: "철근콘크리트구조",
      approvalDate: "1926-09-05",
    });
  });

  it("건축HUB에 PNU 를 나눠 요청한다: 시군구·법정동·대지구분·본번·부번 + 키 + json + 100건", async () => {
    const urls: URL[] = [];
    await lookupBuildings(PNU, { ...deps, fetcher: fake(SEOUL, urls) });
    expect(urls).toHaveLength(1);
    const u = urls[0];
    expect(u.origin + u.pathname).toBe("https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      sigunguCd: "11140",
      bjdongCd: "10300",
      platGbCd: "0",
      bun: "0031",
      ji: "0000",
      _type: "json",
      numOfRows: String(MAX_BUILDINGS),
      pageNo: "1",
      serviceKey: KEY,
    });
  });

  it("산 번지(대지구분 2)는 건축HUB 대지구분 1 로 바꿔 요청하고, 부번도 4자리로 나눈다", async () => {
    const urls: URL[] = [];
    await lookupBuildings("5011013700200010001", { ...deps, fetcher: fake(NONE, urls) });
    expect(urls[0].searchParams.get("platGbCd")).toBe("1");
    expect(urls[0].searchParams.get("bun")).toBe("0001");
    expect(urls[0].searchParams.get("ji")).toBe("0001");
  });

  it("소유자 정보는 결과에 들어가지 않는다 (필요한 5항목과 식별 정보만)", async () => {
    const withOwner = structuredClone(SEOUL);
    withOwner.response.body.items.item[0].ownrNm = "홍길동"; // 혹시 응답에 소유자 필드가 와도
    const r = await lookupBuildings(PNU, { ...deps, fetcher: fake(withOwner) });
    expect(JSON.stringify(r)).not.toContain("홍길동");
    expect(Object.keys(r.buildings[0]).sort()).toEqual(
      ["approvalDate", "dong", "floorsAbove", "floorsBelow", "id", "isAnnex", "label", "mainPurpose", "name", "structure", "totalFloorArea"].sort(),
    );
  });
});

describe("건축물대장 조회 — 건물이 없거나 특이한 경우", () => {
  it("건물이 없는 필지(0건)는 빈 목록 (오류가 아님)", async () => {
    expect(await lookupBuildings(PNU, { ...deps, fetcher: fake(NONE) })).toEqual({ buildings: [], total: 0 });
  });

  it("items 가 빈 글자('')로 와도 빈 목록", async () => {
    expect(await lookupBuildings(PNU, { ...deps, fetcher: fake(envelope("", 0)) })).toEqual({ buildings: [], total: 0 });
  });

  it("결과 없음 코드('03')도 빈 목록", async () => {
    expect(await lookupBuildings(PNU, { ...deps, fetcher: fake(envelope("", 0, "03")) })).toEqual({ buildings: [], total: 0 });
  });

  it("한 동만 있으면 목록이 아니라 객체로 와도 읽는다", async () => {
    const one = envelope({ item: SEOUL.response.body.items.item[0] }, 1);
    const r = await lookupBuildings(PNU, { ...deps, fetcher: fake(one) });
    expect(r.buildings).toHaveLength(1);
    expect(r.buildings[0].label).toBe("신관 · 서울특별시 청사");
  });

  it("부속건축물은 표시한다", async () => {
    const annex = structuredClone(SEOUL);
    annex.response.body.items.item[1].mainAtchGbCdNm = "부속건축물";
    const r = await lookupBuildings(PNU, { ...deps, fetcher: fake(annex) });
    expect(r.buildings.map((b) => b.isAnnex)).toEqual([false, true]);
  });

  it("연면적이 0이거나 비어 있으면 null (화면에서 민원인이 확인), 층수가 비면 null", async () => {
    const odd = structuredClone(SEOUL);
    const row = odd.response.body.items.item[0];
    row.totArea = 0;
    row.grndFlrCnt = "";
    row.ugrndFlrCnt = "abc";
    row.mainPurpsCdNm = "";
    const b = (await lookupBuildings(PNU, { ...deps, fetcher: fake(odd) })).buildings[0];
    expect(b.totalFloorArea).toBeNull();
    expect(b.floorsAbove).toBeNull();
    expect(b.floorsBelow).toBeNull();
    expect(b.mainPurpose).toBe("");
  });

  it("사용승인일이 8자리 숫자가 아니면 빈 글자 (노후 판정은 'unknown' 으로 처리됨)", async () => {
    for (const apr of ["", " ", "2012", "abcd", "2012-08-31"]) {
      const odd = structuredClone(SEOUL);
      odd.response.body.items.item[0].useAprDay = apr;
      const b = (await lookupBuildings(PNU, { ...deps, fetcher: fake(odd) })).buildings[0];
      // 이미 "-" 가 들어 있어도 숫자만 남겨 8자리면 정상으로 읽는다
      expect(b.approvalDate, JSON.stringify(apr)).toBe(apr === "2012-08-31" ? "2012-08-31" : "");
    }
  });

  it("관리번호가 없으면 순번으로 식별한다 (동 선택이 겹치지 않게)", async () => {
    const odd = structuredClone(SEOUL);
    for (const it of odd.response.body.items.item) delete it.mgmBldrgstPk;
    const r = await lookupBuildings(PNU, { ...deps, fetcher: fake(odd) });
    expect(r.buildings.map((b) => b.id)).toEqual(["row-1", "row-2"]);
  });

  it("건물이 100개를 넘으면 첫 100개만 받고, 전체 개수를 함께 돌려준다 (경복궁 140개 사례)", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ ...SEOUL.response.body.items.item[0], mgmBldrgstPk: 1000 + i, dongNm: `동${i}` }));
    const r = await lookupBuildings(PNU, { ...deps, fetcher: fake(envelope({ item: rows }, 140)) });
    expect(r.buildings).toHaveLength(100);
    expect(r.total).toBe(140);
  });
});

describe("건축물대장 조회 — 오류 처리", () => {
  const rejects = (f: typeof fetch) => expect(lookupBuildings(PNU, { ...deps, fetcher: f })).rejects.toBeInstanceOf(UpstreamError);

  it("틀린 인증키(HTTP 403)면 UpstreamError — 키가 메시지에 나오지 않는다", async () => {
    const err = await lookupBuildings(PNU, { ...deps, fetcher: fake(() => new Response("Forbidden", { status: 403 })) }).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(String(err.message)).not.toContain(KEY);
  });

  it("HTTP 500·점검 중 HTML·JSON 이 아닌 응답이면 UpstreamError", async () => {
    await rejects(fake(() => new Response("x", { status: 500 })));
    await rejects(fake(() => new Response("<html>점검 중</html>")));
    await rejects(fake(() => new Response("<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>")));
  });

  it("결과 코드가 정상(00)도 결과 없음(03)도 아니면 UpstreamError (인증키 오류·한도 초과 등)", async () => {
    for (const code of ["01", "10", "11", "12", "20", "22", "30", "31", "99"]) {
      await rejects(fake(envelope({ item: [] }, 0, code)));
    }
  });

  it("응답 모양이 이상하면 UpstreamError", async () => {
    await rejects(fake({ foo: 1 }));
    await rejects(fake({ response: {} }));
    await rejects(fake({ response: { header: { resultCode: "00" } } })); // body 없음
    await rejects(fake(null));
  });

  it("네트워크 오류·시간 초과면 UpstreamError", async () => {
    await rejects((async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch);

    const slow = (async (_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(new DOMException("timeout", "TimeoutError")));
      })) as typeof fetch;
    await expect(lookupBuildings(PNU, { ...deps, fetcher: slow, timeoutMs: 50 })).rejects.toBeInstanceOf(UpstreamError);
  });

  it("인증키 설정이 없으면 외부 오류가 아니라 설정 오류로 던진다 (키 값은 메시지에 없음)", async () => {
    const err = await lookupBuildings(PNU, { fetcher: fake(SEOUL), dataGoKey: "" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UpstreamError);
    expect(String(err.message)).toContain("DATA_GO_KR_API_KEY");
  });

  it("필지 번호가 19자리 숫자가 아니면 호출하지 않고 거절한다", async () => {
    for (const bad of ["", "123", "abc", "1114010300100310000x"]) {
      await expect(lookupBuildings(bad, { ...deps, fetcher: fake(SEOUL) })).rejects.toThrow("19자리");
    }
  });
});
