// /api/lookup 시험: 공공 API와 횟수 저장소를 가짜로 바꿔 끼우고, 횟수 규칙(잡기·돌려주기·유지)과 오류 코드, 건물 진단 흐름을 확인한다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildingInfo, LandInfo } from "../lib/public-api";
import type { UsageKind, UsageStore } from "../lib/usage-limit";

vi.mock("@/lib/public-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/public-api")>()),
  lookupLand: vi.fn(),
  lookupBuildings: vi.fn(),
}));
vi.mock("@/lib/usage-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/usage-limit")>()),
  createSupabaseUsageStore: vi.fn(),
}));

import { POST } from "@/app/api/lookup/route";
import { UpstreamError, lookupBuildings, lookupLand } from "@/lib/public-api";
import { UsageStoreError, createSupabaseUsageStore, hashIp } from "@/lib/usage-limit";

const lookup = vi.mocked(lookupLand);
const buildingsLookup = vi.mocked(lookupBuildings);
const makeStore = vi.mocked(createSupabaseUsageStore);

const PNU = "1114010300100310000";
const IP = "203.0.113.9";
const LAND: LandInfo = {
  pnu: PNU,
  address: "서울특별시 중구 태평로1가 31",
  landCategory: "대",
  area: 12709.4,
  zone: "일반상업지역",
  officialPrice: 65730000,
  officialPriceYear: 2026,
  zones: ["도로"],
  referenceZones: ["광장"],
  dataYear: 2026,
};
const BUILDING: BuildingInfo = {
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
};
const BUILDING_2: BuildingInfo = { ...BUILDING, id: "100311530", label: "건물 2", name: "", dong: "", totalFloorArea: 9453.87, approvalDate: "1926-09-05" };

/** DB 함수와 같은 규칙을 가진 가짜 저장소 */
function fakeStore() {
  const counts = new Map<string, number>();
  const k = (h: string, kind: UsageKind) => `${h}|${kind}`;
  const store: UsageStore & { broken?: boolean } = {
    async reserve(h, kind, limit) {
      if (store.broken) throw new UsageStoreError("reserve 실패");
      const c = counts.get(k(h, kind)) ?? 0;
      if (c >= limit) return false;
      counts.set(k(h, kind), c + 1);
      return true;
    },
    async release(h, kind) {
      counts.set(k(h, kind), Math.max((counts.get(k(h, kind)) ?? 0) - 1, 0));
    },
    async count(h, kind) {
      return counts.get(k(h, kind)) ?? 0;
    },
  };
  return store;
}

let store: ReturnType<typeof fakeStore>;
const used = () => store.count(hashIp(IP), "read");
const call = (body: unknown, ip = IP) =>
  POST(
    new Request("http://localhost/api/lookup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  process.env.IP_HASH_SALT = "test-salt-0123456789abcdef";
  lookup.mockReset();
  buildingsLookup.mockReset();
  store = fakeStore();
  makeStore.mockReset();
  makeStore.mockReturnValue(store);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/lookup — 입력 검사 (횟수를 잡기 전에 거절)", () => {
  it.each([
    ["본문이 JSON 이 아님", "not json"],
    ["본문이 비어 있음", ""],
    ["필지 번호 없음", { type: "land" }],
    ["필지 번호가 19자리 숫자가 아님", { pnu: "123", type: "land" }],
    ["필지 번호에 글자", { pnu: "111401030010031000a", type: "land" }],
    ["종류 없음", { pnu: PNU }],
    ["종류가 이상함", { pnu: PNU, type: "house" }],
  ])("%s → 400 VALIDATION_ERROR, 횟수·공공 API 사용 없음", async (_name, body) => {
    const res = await call(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(lookup).not.toHaveBeenCalled();
    expect(buildingsLookup).not.toHaveBeenCalled();
    expect(await used()).toBe(0);
  });
});

describe("POST /api/lookup — 토지 진단", () => {
  it("200 { data: { land, buildings: null } } 이고 캐시하지 않으며 횟수가 1회 차감된다. 건축물대장은 부르지 않는다", async () => {
    lookup.mockResolvedValue({ found: true, info: LAND });
    const res = await call({ pnu: PNU, type: "land" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ data: { land: LAND, buildings: null, buildingsTotal: null } });
    expect(lookup).toHaveBeenCalledWith(PNU);
    expect(buildingsLookup).not.toHaveBeenCalled();
    expect(await used()).toBe(1);
  });
});

describe("POST /api/lookup — 건물 진단 (건축물대장)", () => {
  it("토지 정보와 건물 목록을 함께 돌려주고, 횟수는 1회만 차감된다", async () => {
    lookup.mockResolvedValue({ found: true, info: LAND });
    buildingsLookup.mockResolvedValue({ buildings: [BUILDING, BUILDING_2], total: 2 });
    const res = await call({ pnu: PNU, type: "building" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { land: LAND, buildings: [BUILDING, BUILDING_2], buildingsTotal: 2 } });
    expect(buildingsLookup).toHaveBeenCalledWith(PNU);
    expect(await used()).toBe(1); // 토지 + 건물을 가져와도 1회
  });

  it("건물이 보여준 것보다 많으면 전체 개수를 함께 돌려준다", async () => {
    lookup.mockResolvedValue({ found: true, info: LAND });
    buildingsLookup.mockResolvedValue({ buildings: [BUILDING], total: 140 });
    const body = await (await call({ pnu: PNU, type: "building" })).json();
    expect(body.data.buildings).toHaveLength(1);
    expect(body.data.buildingsTotal).toBe(140);
  });

  it("건축물대장이 없으면 404 NO_BUILDING_REGISTER + PRD 문구, 차감은 유지된다", async () => {
    lookup.mockResolvedValue({ found: true, info: LAND });
    buildingsLookup.mockResolvedValue({ buildings: [], total: 0 });
    const res = await call({ pnu: PNU, type: "building" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: {
        code: "NO_BUILDING_REGISTER",
        message: "이 주소에는 건축물대장이 없어요. 주소를 확인하거나 토지 진단으로 진행해 주세요",
        // 이미 가져온 토지 정보를 함께 돌려준다 → 토지 진단으로 이어가도 조회 횟수를 또 쓰지 않는다
        details: { land: LAND },
      },
    });
    expect(await used()).toBe(1);
  });

  it("건축물대장 없음 응답에만 토지 정보(details)가 붙는다 — 다른 오류에는 붙지 않는다", async () => {
    lookup.mockResolvedValue({ found: false });
    expect((await (await call({ pnu: PNU, type: "building" })).json()).error.details).toBeUndefined();
    lookup.mockRejectedValue(new UpstreamError("x"));
    expect((await (await call({ pnu: PNU, type: "building" })).json()).error.details).toBeUndefined();
  });

  it("토지 정보가 없으면 404 LAND_INFO_NOT_FOUND (건물 목록이 있어도)", async () => {
    lookup.mockResolvedValue({ found: false });
    buildingsLookup.mockResolvedValue({ buildings: [BUILDING], total: 1 });
    const res = await call({ pnu: PNU, type: "building" });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("LAND_INFO_NOT_FOUND");
    expect(await used()).toBe(1);
  });

  it("건축물대장 API만 실패해도 502 UPSTREAM_FAILED 이고 1회를 돌려준다 (일부만 채운 결과를 주지 않음)", async () => {
    lookup.mockResolvedValue({ found: true, info: LAND });
    buildingsLookup.mockRejectedValue(new UpstreamError("건축물대장 요청이 실패했어요"));
    const res = await call({ pnu: PNU, type: "building" });
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("UPSTREAM_FAILED");
    expect(await used()).toBe(0);
  });

  it("토지 API만 실패해도 502 이고 1회를 돌려준다", async () => {
    lookup.mockRejectedValue(new UpstreamError("토지 요청이 실패했어요"));
    buildingsLookup.mockResolvedValue({ buildings: [BUILDING], total: 1 });
    const res = await call({ pnu: PNU, type: "building" });
    expect(res.status).toBe(502);
    expect(await used()).toBe(0);
  });

  it("건물 진단에서 20번 성공하면 21번째는 429 (건축물대장을 함께 가져와도 1회씩만 센다)", async () => {
    lookup.mockResolvedValue({ found: true, info: LAND });
    buildingsLookup.mockResolvedValue({ buildings: [BUILDING], total: 1 });
    for (let i = 0; i < 20; i++) expect((await call({ pnu: PNU, type: "building" })).status, `${i + 1}번째`).toBe(200);
    expect((await call({ pnu: PNU, type: "building" })).status).toBe(429);
    expect(await used()).toBe(20);
  });
});

describe("POST /api/lookup — 횟수 규칙", () => {
  it("정보가 없으면(정상 응답) 404 LAND_INFO_NOT_FOUND + PRD 문구, 차감은 유지된다", async () => {
    lookup.mockResolvedValue({ found: false });
    const res = await call({ pnu: PNU, type: "land" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "LAND_INFO_NOT_FOUND", message: "주소를 찾을 수 없어요. 지번이나 도로명 주소를 다시 확인해 주세요" },
    });
    expect(await used()).toBe(1); // 없는 필지를 반복 조회하는 것을 막기 위해 돌려주지 않는다
  });

  it("공공 API 오류면 502 UPSTREAM_FAILED + PRD 문구, 잡아 둔 1회는 돌려준다", async () => {
    lookup.mockRejectedValue(new UpstreamError("토지 정보 요청이 실패했어요"));
    const res = await call({ pnu: PNU, type: "land" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { code: "UPSTREAM_FAILED", message: "지금 정보를 가져올 수 없어요. 잠시 후 다시 시도해 주세요" },
    });
    expect(await used()).toBe(0);
  });

  it("한도(20회)에 도달하면 429 LIMIT_EXCEEDED + PRD 문구, 공공 API는 부르지 않는다", async () => {
    lookup.mockResolvedValue({ found: true, info: LAND });
    for (let i = 0; i < 20; i++) expect((await call({ pnu: PNU, type: "land" })).status).toBe(200);
    lookup.mockClear();
    const res = await call({ pnu: PNU, type: "land" });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: { code: "LIMIT_EXCEEDED", message: "오늘 주소 조회 횟수를 모두 썼어요(20/20). 내일 0시에 다시 이용할 수 있어요" },
    });
    expect(lookup).not.toHaveBeenCalled();
    expect(await used()).toBe(20);
  });

  it("실패한 조회는 횟수를 쓰지 않으므로 20번 실패해도 한도에 걸리지 않는다", async () => {
    lookup.mockRejectedValue(new UpstreamError("x"));
    for (let i = 0; i < 25; i++) expect((await call({ pnu: PNU, type: "land" })).status).toBe(502);
    expect(await used()).toBe(0);
  });

  it("다른 접속 주소는 따로 센다", async () => {
    lookup.mockResolvedValue({ found: true, info: LAND });
    for (let i = 0; i < 20; i++) await call({ pnu: PNU, type: "land" });
    expect((await call({ pnu: PNU, type: "land" })).status).toBe(429);
    expect((await call({ pnu: PNU, type: "land" }, "198.51.100.1")).status).toBe(200);
  });

  it("횟수 저장소가 고장 나면 500 SERVER_ERROR 이고 공공 API를 부르지 않는다 (닫는 쪽으로 실패)", async () => {
    store.broken = true;
    const res = await call({ pnu: PNU, type: "building" });
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("SERVER_ERROR");
    expect(lookup).not.toHaveBeenCalled();
    expect(buildingsLookup).not.toHaveBeenCalled();
  });

  it("예상하지 못한 오류면 500 SERVER_ERROR 이고 내용(키 이름 등)은 밖으로 나가지 않으며, 1회는 돌려준다", async () => {
    lookup.mockRejectedValue(new Error("환경 변수 VWORLD_API_KEY 값이 없어요"));
    const res = await call({ pnu: PNU, type: "land" });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("VWORLD");
    expect(await used()).toBe(0);
  });
});

describe("POST /api/lookup — 개인정보", () => {
  it("오류가 나도 필지 번호·접속 주소를 로그에 남기지 않는다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    lookup.mockRejectedValue(new UpstreamError("x"));
    await call({ pnu: PNU, type: "land" });
    lookup.mockRejectedValue(new Error("y"));
    await call({ pnu: PNU, type: "building" });
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).not.toContain(PNU);
    expect(logged).not.toContain(IP);
  });

  it("건물 응답에 소유자 정보가 들어 있지 않다 (5항목 + 식별 정보만)", async () => {
    lookup.mockResolvedValue({ found: true, info: LAND });
    buildingsLookup.mockResolvedValue({ buildings: [BUILDING], total: 1 });
    const text = await (await call({ pnu: PNU, type: "building" })).text();
    expect(text).not.toMatch(/owner|ownr|소유/i);
  });
});
