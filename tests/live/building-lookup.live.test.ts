// 실제 공공데이터포털 건축HUB로 건축물대장 조회를 시험한다. (기본 `npm test`에서는 건너뜀)
// 실행:  bash →  RUN_LIVE_TESTS=1 npm test        PowerShell →  $env:RUN_LIVE_TESTS=1; npm test
// 공개된 서울시청 부지만 쓴다. .env 의 값은 읽기만 하고 출력하지 않는다.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lookupBuildings } from "../../lib/public-api";

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
const enabled = process.env.RUN_LIVE_TESTS === "1" && !!env.DATA_GO_KR_API_KEY;
const deps = { dataGoKey: env.DATA_GO_KR_API_KEY };

describe.skipIf(!enabled)("실제 건축HUB 건축물대장 (RUN_LIVE_TESTS=1)", () => {
  it("서울시청 부지의 건물 두 동이 나오고, 신관의 5항목이 맞다", async () => {
    const r = await lookupBuildings("1114010300100310000", deps);
    expect(r.total).toBeGreaterThanOrEqual(2);
    const annex = r.buildings.find((b) => b.dong === "신관");
    expect(annex).toBeDefined();
    expect(annex).toMatchObject({
      name: "서울특별시 청사",
      mainPurpose: "업무시설",
      structure: "철골철근콘크리트구조",
      floorsAbove: 13,
      floorsBelow: 5,
      approvalDate: "2012-08-31",
    });
    expect(annex!.totalFloorArea).toBeGreaterThan(80000);
  });

  it("건물이 없는 필지(제주 연동 산 1-1)는 빈 목록", async () => {
    expect((await lookupBuildings("5011013700200010001", deps)).buildings).toEqual([]);
  });

  it("틀린 키는 UpstreamError 이고 키가 오류 메시지에 나오지 않는다", async () => {
    const err = await lookupBuildings("1114010300100310000", { dataGoKey: "WRONG-KEY-0000" }).catch((e) => e);
    expect(err.name).toBe("UpstreamError");
    expect(String(err.message)).not.toContain("WRONG-KEY");
  });
});
