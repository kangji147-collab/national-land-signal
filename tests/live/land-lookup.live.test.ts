// 실제 브이월드로 토지 정보 조회를 시험한다. (기본 `npm test`에서는 건너뜀)
// 실행:  bash →  RUN_LIVE_TESTS=1 npm test        PowerShell →  $env:RUN_LIVE_TESTS=1; npm test
// 공개된 서울시청 부지만 쓴다. 공시지가는 해마다 바뀌므로 값 자체가 아니라 모양을 확인한다.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lookupLand } from "../../lib/public-api";

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

describe.skipIf(!enabled)("실제 브이월드 토지 정보 (RUN_LIVE_TESTS=1)", () => {
  it("서울시청 부지의 토지 6항목이 모두 나온다", async () => {
    const r = await lookupLand("1114010300100310000", deps);
    expect(r.found).toBe(true);
    if (!r.found) return;
    expect(r.info.address).toBe("서울특별시 중구 태평로1가 31");
    expect(r.info.landCategory).toBe("대");
    expect(r.info.area).toBeCloseTo(12709.4, 1);
    expect(r.info.zone).toBe("일반상업지역");
    expect(r.info.officialPrice).toBeGreaterThan(0);
    expect(r.info.officialPriceYear).toBeGreaterThanOrEqual(2025);
    expect(r.info.zones.length).toBeGreaterThan(5);
    expect(r.info.zones).not.toContain("일반상업지역");
  });

  it("없는 필지는 found:false", async () => {
    expect(await lookupLand("1114010300199990000", deps)).toEqual({ found: false });
  });

  it("틀린 키는 UpstreamError 이고 키가 오류 메시지에 나오지 않는다", async () => {
    const err = await lookupLand("1114010300100310000", { ...deps, vworldKey: "WRONG-KEY-0000" }).catch((e) => e);
    expect(err.name).toBe("UpstreamError");
    expect(String(err.message)).not.toContain("WRONG-KEY");
  });
});
