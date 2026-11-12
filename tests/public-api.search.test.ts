// 주소 검색(lib/public-api.ts) 시험: 2026-11-12에 브이월드에서 받아 둔 실제 응답(tests/fixtures)을 쓴다. 네트워크 접속 없음.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_CANDIDATES, UpstreamError, searchAddress } from "../lib/public-api";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"));

const PARCEL = fixture("vworld-search-parcel-taepyeong31.json");
const ROAD = fixture("vworld-search-road-sejong110.json");
const NOT_FOUND = fixture("vworld-search-notfound.json");

const KEY = "TEST-KEY-ABCDEF";
const DOMAIN = "localhost:3000";
const deps = { vworldKey: KEY, vworldDomain: DOMAIN };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** 요청 주소를 기록하며, category(parcel/road)에 따라 정해 둔 응답을 돌려주는 가짜 fetch */
function fakeFetch(byCategory: { parcel: () => Response | Promise<Response>; road: () => Response | Promise<Response> }) {
  const urls: URL[] = [];
  const fetcher = (async (input: URL | string) => {
    const url = new URL(String(input));
    urls.push(url);
    return url.searchParams.get("category") === "parcel" ? byCategory.parcel() : byCategory.road();
  }) as typeof fetch;
  return { fetcher, urls };
}

describe("주소 검색 — 합치기", () => {
  it("지번 검색 결과: 전체 지번 주소를 제목으로, 도로명·건물 이름을 보조로 보여준다", async () => {
    const { fetcher } = fakeFetch({ parcel: () => json(PARCEL), road: () => json(NOT_FOUND) });
    const r = await searchAddress("서울특별시 중구 태평로1가 31", { ...deps, fetcher });
    expect(r.candidates[0]).toEqual({
      pnu: "1114010300100310000",
      label: "서울특별시 중구 태평로1가 31",
      detail: "도로명: 세종대로 110",
      buildingName: "서울특별시청",
    });
    // 같은 번지에서 갈라진 필지(31-1 등)도 후보로 나온다
    expect(r.candidates.map((c) => c.label)).toContain("서울특별시 중구 태평로1가 31-1");
    expect(r.total).toBeGreaterThanOrEqual(r.candidates.length);
  });

  it("도로명 검색 결과: 전체 도로명 주소를 제목으로, 지번을 보조로 보여준다", async () => {
    const { fetcher } = fakeFetch({ parcel: () => json(NOT_FOUND), road: () => json(ROAD) });
    const r = await searchAddress("세종대로 110", { ...deps, fetcher });
    expect(r.candidates).toHaveLength(1); // 같은 필지(건물 이름만 다른 2건)는 한 번만
    expect(r.candidates[0]).toMatchObject({
      pnu: "1114010300100310000",
      label: "서울특별시 중구 세종대로 110 (태평로1가)",
      detail: "지번: 태평로1가 31",
    });
  });

  it("같은 필지가 건물 이름만 달라 2줄로 와도 전체 개수는 1이다 (\"결과가 많아요\" 안내가 뜨지 않게)", async () => {
    const { fetcher } = fakeFetch({ parcel: () => json(NOT_FOUND), road: () => json(ROAD) });
    const r = await searchAddress("세종대로 110", { ...deps, fetcher });
    expect(ROAD.response.record.total).toBe("2"); // 브이월드는 2건으로 센다
    expect(r.candidates).toHaveLength(1);
    expect(r.total).toBe(1);
  });

  it("결과가 잘렸으면(더 많이 남아 있으면) 브이월드가 알려 준 전체 개수를 쓴다", async () => {
    const many = structuredClone(PARCEL);
    many.response.record.total = "465";
    const { fetcher } = fakeFetch({ parcel: () => json(many), road: () => json(NOT_FOUND) });
    const r = await searchAddress("태평로1가", { ...deps, fetcher });
    expect(r.total).toBe(465);
    expect(r.total).toBeGreaterThan(r.candidates.length);
  });

  it("두 검색에서 같은 필지가 나오면 한 번만 보여주고, 전체 주소를 채워 합친다", async () => {
    const { fetcher } = fakeFetch({ parcel: () => json(PARCEL), road: () => json(ROAD) });
    const r = await searchAddress("태평로1가 31", { ...deps, fetcher });
    const same = r.candidates.filter((c) => c.pnu === "1114010300100310000");
    expect(same).toHaveLength(1);
    expect(same[0].label).toBe("서울특별시 중구 태평로1가 31"); // 지번 전체 형태 우선
    expect(same[0].detail).toBe("도로명: 서울특별시 중구 세종대로 110 (태평로1가)"); // 도로명도 전체 형태로 채움
    expect(same[0].buildingName).toBe("서울특별시청");
  });

  it("후보는 최대 10개", async () => {
    const many = structuredClone(PARCEL);
    const base = many.response.result.items[0];
    many.response.result.items = Array.from({ length: 30 }, (_, i) => ({
      ...base,
      id: `1114010300100${String(i + 100).padStart(3, "0")}0000`.slice(0, 19),
      address: { ...base.address, parcel: `서울특별시 중구 태평로1가 ${i + 100}` },
    }));
    const { fetcher } = fakeFetch({ parcel: () => json(many), road: () => json(NOT_FOUND) });
    const r = await searchAddress("태평로1가", { ...deps, fetcher });
    expect(r.candidates).toHaveLength(MAX_CANDIDATES);
  });

  it("필지 번호가 19자리 숫자가 아닌 항목은 건너뛴다", async () => {
    const bad = structuredClone(PARCEL);
    bad.response.result.items[0].id = "abc";
    const { fetcher } = fakeFetch({ parcel: () => json(bad), road: () => json(NOT_FOUND) });
    const r = await searchAddress("x주소", { ...deps, fetcher });
    expect(r.candidates.every((c) => /^\d{19}$/.test(c.pnu))).toBe(true);
    expect(r.candidates.find((c) => c.label === "서울특별시 중구 태평로1가 31")).toBeUndefined();
  });

  it("둘 다 결과 없음(NOT_FOUND)이면 빈 목록", async () => {
    const { fetcher } = fakeFetch({ parcel: () => json(NOT_FOUND), road: () => json(NOT_FOUND) });
    expect(await searchAddress("없는주소 99999", { ...deps, fetcher })).toEqual({ candidates: [], total: 0 });
  });
});

describe("주소 검색 — 요청 모양", () => {
  it("지번·도로명 두 가지를 동시에, 주소 검색 형식(type=address)과 키·서비스 주소를 붙여 요청한다", async () => {
    const { fetcher, urls } = fakeFetch({ parcel: () => json(NOT_FOUND), road: () => json(NOT_FOUND) });
    await searchAddress("  서울   중구   세종대로 110  ", { ...deps, fetcher });
    expect(urls).toHaveLength(2);
    expect(urls.map((u) => u.searchParams.get("category")).sort()).toEqual(["parcel", "road"]);
    for (const u of urls) {
      expect(u.origin + u.pathname).toBe("https://api.vworld.kr/req/search");
      expect(u.searchParams.get("type")).toBe("address");
      expect(u.searchParams.get("size")).toBe("10");
      expect(u.searchParams.get("key")).toBe(KEY);
      expect(u.searchParams.get("domain")).toBe(DOMAIN);
      expect(u.searchParams.get("query")).toBe("서울 중구 세종대로 110"); // 앞뒤·중복 공백 정리
    }
  });

  it("환경 변수(키·서비스 주소)가 없으면 외부 오류가 아니라 설정 오류로 던진다", async () => {
    const { fetcher } = fakeFetch({ parcel: () => json(NOT_FOUND), road: () => json(NOT_FOUND) });
    const err = await searchAddress("주소", { fetcher, vworldKey: "", vworldDomain: DOMAIN }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UpstreamError);
    expect(String(err.message)).not.toContain(KEY);
  });
});

describe("주소 검색 — 오류 처리", () => {
  const upstream = (what: string) => expect.objectContaining({ name: "UpstreamError", message: expect.stringContaining(what) });

  it("한쪽만 실패해도 다른 쪽 결과를 쓴다", async () => {
    const { fetcher } = fakeFetch({ parcel: () => json({}, 500), road: () => json(ROAD) });
    const r = await searchAddress("세종대로 110", { ...deps, fetcher });
    expect(r.candidates[0].pnu).toBe("1114010300100310000");
  });

  it("둘 다 실패하면 UpstreamError (HTTP 오류)", async () => {
    const { fetcher } = fakeFetch({ parcel: () => json({}, 500), road: () => json({}, 503) });
    await expect(searchAddress("주소", { ...deps, fetcher })).rejects.toEqual(upstream("HTTP"));
  });

  it("브이월드가 키를 거절하면(status ERROR) UpstreamError — 오류 내용·키가 메시지에 들어가지 않는다", async () => {
    const denied = { response: { status: "ERROR", error: { level: "1", code: "INVALID_KEY", text: `등록되지 않은 인증키입니다 ${KEY}` } } };
    const { fetcher } = fakeFetch({ parcel: () => json(denied), road: () => json(denied) });
    const err = await searchAddress("주소", { ...deps, fetcher }).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(String(err.message)).not.toContain(KEY);
    expect(String(err.message)).not.toContain("INVALID_KEY");
  });

  it("JSON이 아닌 응답이면 UpstreamError", async () => {
    const html = () => new Response("<html>점검 중</html>", { status: 200 });
    const { fetcher } = fakeFetch({ parcel: html, road: html });
    await expect(searchAddress("주소", { ...deps, fetcher })).rejects.toBeInstanceOf(UpstreamError);
  });

  it("응답 모양이 이상하면 UpstreamError", async () => {
    const { fetcher } = fakeFetch({ parcel: () => json({ foo: 1 }), road: () => json({ response: { status: "OK" } }) });
    await expect(searchAddress("주소", { ...deps, fetcher })).rejects.toBeInstanceOf(UpstreamError);
  });

  it("네트워크 오류면 UpstreamError", async () => {
    const fetcher = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(searchAddress("주소", { ...deps, fetcher })).rejects.toBeInstanceOf(UpstreamError);
  });

  it("시간 제한을 넘기면 UpstreamError", async () => {
    const slow = (async (_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(new DOMException("timeout", "TimeoutError")));
      })) as typeof fetch;
    await expect(searchAddress("주소", { ...deps, fetcher: slow, timeoutMs: 50 })).rejects.toBeInstanceOf(UpstreamError);
  });
});
