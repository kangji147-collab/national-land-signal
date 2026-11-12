// /api/layout-items 시험: 시설물 표 읽기만 가짜로 바꿔 끼우고 응답을 확인한다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RulesSourceError } from "../lib/rules-source";

vi.mock("@/lib/supabase", () => ({ createAnonClient: vi.fn(() => ({})) }));
vi.mock("@/lib/rules-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/rules-source")>()),
  fetchLayoutItems: vi.fn(),
}));
import { GET } from "@/app/api/layout-items/route";
import { fetchLayoutItems } from "@/lib/rules-source";

const get = (qs: string, headers: Record<string, string> = {}) => GET(new Request(`http://localhost/api/layout-items?${qs}`, { headers }));
const q = (t: string) => "theme=" + encodeURIComponent(t);

describe("GET /api/layout-items", () => {
  beforeEach(() => {
    vi.mocked(fetchLayoutItems).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  it("토지 테마의 시설물 목록을 돌려준다", async () => {
    vi.mocked(fetchLayoutItems).mockResolvedValue([{ theme: "공영주차장", name: "주차 1면", icon: "🚗", areaM2: 25, units: 1, unitLabel: "면", sortOrder: 1 }]);
    const res = await get(q("공영주차장"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { items: [{ name: "주차 1면", areaM2: 25 }] } });
  });
  it("건물 테마도 목록을 돌려준다 (건물 주변 외부 시설)", async () => {
    vi.mocked(fetchLayoutItems).mockResolvedValue([{ theme: "공유오피스", name: "자전거 거치대", icon: "🚲", areaM2: 6, units: 0, unitLabel: "", sortOrder: 2 }]);
    const res = await get(q("공유오피스"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { items: [{ name: "자전거 거치대", units: 0 }] } });
  });
  it("모르는 테마·빈 값은 400", async () => {
    expect((await get(q("없는테마"))).status).toBe(400);
    expect((await get("")).status).toBe(400);
    expect(fetchLayoutItems).not.toHaveBeenCalled();
  });
  it("다른 사이트에서 온 브라우저 요청은 거절", async () => {
    expect((await get(q("공영주차장"), { "sec-fetch-site": "cross-site" })).status).toBe(403);
  });
  it("읽기 실패는 500이고 내용이 새지 않는다", async () => {
    vi.mocked(fetchLayoutItems).mockRejectedValue(new RulesSourceError("비밀 표 내용"));
    const res = await get(q("소공원"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("비밀");
  });
});
