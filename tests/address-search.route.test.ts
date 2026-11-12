// /api/address-search 시험: 공공 API와 횟수 저장소를 가짜로 바꿔 끼우고, 입력 검사·응답 모양·오류 코드·횟수 규칙을 확인한다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressSearchResult } from "../lib/public-api";
import type { UsageKind, UsageStore } from "../lib/usage-limit";

vi.mock("@/lib/public-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/public-api")>()),
  searchAddress: vi.fn(),
}));
vi.mock("@/lib/usage-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/usage-limit")>()),
  createSupabaseUsageStore: vi.fn(),
}));

import { GET } from "@/app/api/address-search/route";
import { UpstreamError, searchAddress } from "@/lib/public-api";
import { UsageStoreError, createSupabaseUsageStore, hashIp } from "@/lib/usage-limit";

const search = vi.mocked(searchAddress);
const makeStore = vi.mocked(createSupabaseUsageStore);

const IP = "203.0.113.9";
const ONE: AddressSearchResult = {
  candidates: [{ pnu: "1".repeat(19), label: "서울특별시 중구 태평로1가 31", detail: "", buildingName: "" }],
  total: 1,
};

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
const used = (kind: UsageKind = "search") => store.count(hashIp(IP), kind);
const call = (q?: string, ip = IP) =>
  GET(
    new Request(`http://localhost/api/address-search${q === undefined ? "" : `?q=${encodeURIComponent(q)}`}`, {
      headers: { "x-real-ip": ip },
    }),
  );

beforeEach(() => {
  process.env.IP_HASH_SALT = "test-salt-0123456789abcdef";
  search.mockReset();
  store = fakeStore();
  makeStore.mockReset();
  makeStore.mockReturnValue(store);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/address-search — 입력 검사 (횟수를 잡기 전에 거절)", () => {
  it("글자가 없거나 1글자면 400 VALIDATION_ERROR (공공 API·횟수 사용 없음)", async () => {
    for (const q of [undefined, "", " ", "가", "  나  "]) {
      const res = await call(q);
      expect(res.status, JSON.stringify(q)).toBe(400);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
    expect(search).not.toHaveBeenCalled();
    expect(await used()).toBe(0);
  });

  it("101자 이상이면 400", async () => {
    expect((await call("가".repeat(101))).status).toBe(400);
    expect(search).not.toHaveBeenCalled();
    expect(await used()).toBe(0);
  });

  it("100자는 허용", async () => {
    search.mockResolvedValue(ONE);
    expect((await call("가".repeat(100))).status).toBe(200);
  });

  it("앞뒤 공백을 떼고 검색한다", async () => {
    search.mockResolvedValue(ONE);
    await call("  태평로1가 31  ");
    expect(search).toHaveBeenCalledWith("태평로1가 31");
  });
});

describe("GET /api/address-search — 응답", () => {
  it("성공하면 200 { data: { candidates, total } } 이고 캐시하지 않는다", async () => {
    search.mockResolvedValue(ONE);
    const res = await call("태평로1가 31");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ data: ONE });
  });

  it("결과가 없으면 404 ADDRESS_NOT_FOUND + PRD 문구", async () => {
    search.mockResolvedValue({ candidates: [], total: 0 });
    const res = await call("없는주소 99999");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "ADDRESS_NOT_FOUND", message: "주소를 찾을 수 없어요. 지번이나 도로명 주소를 다시 확인해 주세요" },
    });
  });

  it("공공 API 오류면 502 UPSTREAM_FAILED + PRD 문구", async () => {
    search.mockRejectedValue(new UpstreamError("검색 요청이 실패했어요"));
    const res = await call("태평로1가 31");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { code: "UPSTREAM_FAILED", message: "지금 정보를 가져올 수 없어요. 잠시 후 다시 시도해 주세요" },
    });
  });

  it("예상하지 못한 오류면 500 SERVER_ERROR (내용은 밖으로 보내지 않음)", async () => {
    search.mockRejectedValue(new Error("환경 변수 VWORLD_API_KEY 값이 없어요"));
    const res = await call("태평로1가 31");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain("SERVER_ERROR");
    expect(text).not.toContain("VWORLD");
  });
});

describe("GET /api/address-search — 하루 100회 상한 (주소 조회 20회와 따로 센다)", () => {
  it("검색마다 주소 검색 횟수가 1회씩 차감되고, 정보 가져오기(주소 조회) 횟수는 건드리지 않는다", async () => {
    search.mockResolvedValue(ONE);
    await call("태평로1가 31");
    await call("세종대로 110");
    expect(await used("search")).toBe(2);
    expect(await used("read")).toBe(0);
  });

  it("결과가 없어도(404) 차감은 유지된다 (없는 주소를 반복 검색하는 것을 막음)", async () => {
    search.mockResolvedValue({ candidates: [], total: 0 });
    await call("없는주소 99999");
    expect(await used()).toBe(1);
  });

  it("공공 API 오류면 잡아 둔 1회를 돌려준다", async () => {
    search.mockRejectedValue(new UpstreamError("x"));
    await call("태평로1가 31");
    expect(await used()).toBe(0);
  });

  it("100번까지 성공하고 101번째는 429 LIMIT_EXCEEDED + 문구, 공공 API는 부르지 않는다", async () => {
    search.mockResolvedValue(ONE);
    for (let i = 0; i < 100; i++) expect((await call("태평로1가 31")).status, `${i + 1}번째`).toBe(200);
    search.mockClear();
    const res = await call("태평로1가 31");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: { code: "LIMIT_EXCEEDED", message: "오늘 주소 검색 횟수를 모두 썼어요(100/100). 내일 0시에 다시 이용할 수 있어요" },
    });
    expect(search).not.toHaveBeenCalled();
    expect(await used()).toBe(100);
  });

  it("실패한 검색은 횟수를 쓰지 않으므로 계속 실패해도 한도에 걸리지 않는다", async () => {
    search.mockRejectedValue(new UpstreamError("x"));
    for (let i = 0; i < 120; i++) expect((await call("태평로1가 31")).status).toBe(502);
    expect(await used()).toBe(0);
  });

  it("다른 접속 주소는 따로 센다", async () => {
    search.mockResolvedValue(ONE);
    for (let i = 0; i < 100; i++) await call("태평로1가 31");
    expect((await call("태평로1가 31")).status).toBe(429);
    expect((await call("태평로1가 31", "198.51.100.1")).status).toBe(200);
  });

  it("횟수 저장소가 고장 나면 500 SERVER_ERROR 이고 공공 API를 부르지 않는다 (닫는 쪽으로 실패)", async () => {
    store.broken = true;
    const res = await call("태평로1가 31");
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("SERVER_ERROR");
    expect(search).not.toHaveBeenCalled();
  });
});

describe("GET /api/address-search — 개인정보", () => {
  it("오류가 나도 입력한 주소·접속 주소를 로그에 남기지 않는다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    search.mockRejectedValue(new UpstreamError("x"));
    await call("비밀스러운주소 123");
    search.mockRejectedValue(new Error("y"));
    await call("비밀스러운주소 123");
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("비밀스러운주소");
    expect(logged).not.toContain(IP);
  });
});
