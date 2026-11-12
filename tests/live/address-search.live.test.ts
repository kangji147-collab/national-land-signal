// 실제 브이월드로 주소 검색을 시험한다. (기본 `npm test`에서는 건너뜀)
// 실행:  bash →  RUN_LIVE_TESTS=1 npm test        PowerShell →  $env:RUN_LIVE_TESTS=1; npm test
// 공개된 서울시청 부지 주소만 쓴다. .env 의 값은 읽기만 하고 출력하지 않는다.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { searchAddress } from "../../lib/public-api";

function loadEnv(): Record<string, string> {
  try {
    const path = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env");
    const out: Record<string, string> = {};
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_]\w*)\s*=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

const env = loadEnv();
const enabled = process.env.RUN_LIVE_TESTS === "1" && !!env.VWORLD_API_KEY && !!env.VWORLD_DOMAIN;
const deps = { vworldKey: env.VWORLD_API_KEY, vworldDomain: env.VWORLD_DOMAIN };

describe.skipIf(!enabled)("실제 브이월드 주소 검색 (RUN_LIVE_TESTS=1)", () => {
  it("지번 주소로 찾으면 서울시청 부지의 필지 번호가 첫 후보로 나온다", async () => {
    const r = await searchAddress("서울특별시 중구 태평로1가 31", deps);
    expect(r.candidates[0].pnu).toBe("1114010300100310000");
    expect(r.candidates[0].label).toBe("서울특별시 중구 태평로1가 31");
  });

  it("도로명 주소로 찾아도 같은 필지 번호가 나온다", async () => {
    const r = await searchAddress("세종대로 110", deps);
    expect(r.candidates.map((c) => c.pnu)).toContain("1114010300100310000");
  });

  it("없는 주소는 빈 목록", async () => {
    expect((await searchAddress("서울특별시 중구 없는동 99999", deps)).candidates).toEqual([]);
  });

  it("틀린 키는 UpstreamError 이고 키가 오류 메시지에 나오지 않는다", async () => {
    const err = await searchAddress("태평로1가 31", { ...deps, vworldKey: "WRONG-KEY-0000" }).catch((e) => e);
    expect(err.name).toBe("UpstreamError");
    expect(String(err.message)).not.toContain("WRONG-KEY");
  });
});
