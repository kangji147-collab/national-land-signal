// /api/themes 시험: 테마 허용표 읽기만 가짜로 바꿔 끼우고 응답을 확인한다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RulesSourceError } from "../lib/rules-source";

vi.mock("@/lib/supabase", () => ({ createAnonClient: vi.fn(() => ({})) }));
vi.mock("@/lib/rules-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/rules-source")>()),
  fetchAllowedThemes: vi.fn(),
}));
import { GET } from "@/app/api/themes/route";
import { fetchAllowedThemes as mocked } from "@/lib/rules-source";

const get = (qs: string) => GET(new Request(`http://localhost/api/themes?${qs}`));

describe("GET /api/themes", () => {
  beforeEach(() => {
    vi.mocked(mocked).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  it("허용 테마 목록을 돌려준다", async () => {
    vi.mocked(mocked).mockResolvedValue(["소공원"]);
    const res = await get("type=land&zone=" + encodeURIComponent("제2종일반주거지역"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { themes: ["소공원"] } });
  });
  it("종류가 틀리면 400, 읽기 실패는 500 (내용 노출 없음)", async () => {
    expect((await get("type=x&zone=a")).status).toBe(400);
    expect((await get("zone=a")).status).toBe(400);
    vi.mocked(mocked).mockRejectedValue(new RulesSourceError("비밀 표 내용"));
    const res = await get("type=land&zone=a");
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("비밀");
  });
});
