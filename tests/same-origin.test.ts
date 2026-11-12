// 다른 사이트 호출 막기 시험 (lib/same-origin.ts)
import { describe, expect, it } from "vitest";
import { rejectCrossSite } from "../lib/same-origin";

const req = (headers: Record<string, string>) => new Request("https://app.example.com/api/simulate", { method: "POST", headers });

describe("다른 사이트에서 온 브라우저 요청 거절", () => {
  it("우리 화면에서 보낸 요청은 통과", () => {
    expect(rejectCrossSite(req({ "sec-fetch-site": "same-origin", origin: "https://app.example.com", host: "app.example.com" }))).toBeNull();
  });
  it("주소창에서 직접 연 요청(none)은 통과", () => {
    expect(rejectCrossSite(req({ "sec-fetch-site": "none" }))).toBeNull();
  });
  it("서버끼리·시험·curl 처럼 출처 정보가 없으면 통과", () => {
    expect(rejectCrossSite(req({}))).toBeNull();
  });
  it("다른 사이트(cross-site)·같은 사이트의 다른 하위 주소(same-site)는 거절", async () => {
    for (const s of ["cross-site", "same-site"]) {
      const res = rejectCrossSite(req({ "sec-fetch-site": s }));
      expect(res?.status).toBe(403);
      expect((await res?.json()).error.code).toBe("FORBIDDEN_ORIGIN");
    }
  });
  it("Origin 이 우리 주소와 다르면 거절 (Sec-Fetch-Site 가 없는 옛 브라우저)", () => {
    expect(rejectCrossSite(req({ origin: "https://evil.example.org", host: "app.example.com" }))?.status).toBe(403);
    expect(rejectCrossSite(req({ origin: "null", host: "app.example.com" }))?.status).toBe(403);
  });
  it("Vercel 뒤에서는 x-forwarded-host 와 비교", () => {
    expect(rejectCrossSite(req({ origin: "https://my.app", "x-forwarded-host": "my.app", host: "internal" }))).toBeNull();
  });
});
