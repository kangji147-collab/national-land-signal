// Design Ref: §6, §4.3, §4.4 — POST /api/lookup : 고른 필지의 토지 정보(+ 건물 진단이면 건축물대장)를 공공 API에서 가져온다.
// 주소 조회 1회를 먼저 잡는다. 건물 진단도 같은 요청 안에서 건축물대장까지 가져오므로 1회다.
//
// 횟수 규칙 (DESIGN §4.3)
//  - 입력이 잘못됐으면 횟수를 잡기 전에 거절한다. (400)
//  - 한도에 도달했으면 공공 API를 부르지 않고 거절한다. (429)
//  - 공공 API 오류·시간 초과는 던져진 오류라서 잡아 둔 1회가 돌아온다. (502) — 토지·건물 중 하나만 실패해도 전부 돌려준다.
//  - 정상 응답인데 정보가 없는 경우(토지 정보 없음·건축물대장 없음, 404)는 값으로 돌려주므로 차감이 유지된다.
//  - 횟수 저장소(DB)가 고장 나면 작업을 하지 않는다. (500, 닫는 쪽으로 실패)
// 개인정보: 필지 번호·주소는 저장하지 않고 로그에도 남기지 않는다. 건축물대장 소유자 정보는 요청하지도 않는다.
import { z } from "zod";
import { fail, ok, serverError } from "@/lib/api-response";
import { MESSAGES } from "@/lib/messages";
import { type BuildingLookup, type LandInfo, UpstreamError, lookupBuildings, lookupLand } from "@/lib/public-api";
import { createSupabaseUsageStore, getClientIp, runWithUsage } from "@/lib/usage-limit";

// 필지 번호는 숫자 19자리 (DESIGN §8). 건물 진단(building)이면 건축물대장도 함께 가져온다.
const Body = z.object({
  pnu: z.string().regex(/^\d{19}$/),
  type: z.enum(["land", "building"]),
});

type Outcome =
  | { kind: "land-not-found" }
  | { kind: "no-building"; land: LandInfo }
  | { kind: "ok"; land: LandInfo; buildings: BuildingLookup | null };

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return fail("VALIDATION_ERROR", "필지를 다시 선택해 주세요");
  const { pnu, type } = parsed.data;

  try {
    const ip = getClientIp(request.headers);
    const result = await runWithUsage<Outcome>(createSupabaseUsageStore(), "read", ip, async () => {
      // 토지와 건물은 서로 기다릴 필요가 없어 동시에 부른다 (하나라도 실패하면 전체가 실패 → 횟수 반환)
      const [land, buildings] = await Promise.all([
        lookupLand(pnu),
        type === "building" ? lookupBuildings(pnu) : Promise.resolve(null),
      ]);
      if (!land.found) return { kind: "land-not-found" };
      if (buildings && buildings.buildings.length === 0) return { kind: "no-building", land: land.info };
      return { kind: "ok", land: land.info, buildings };
    });

    if (!result.ok) return fail("LIMIT_EXCEEDED", result.message);
    switch (result.value.kind) {
      case "land-not-found":
        return fail("LAND_INFO_NOT_FOUND", MESSAGES.addressNotFound);
      case "no-building":
        // 토지 정보는 이미 가져왔으므로 함께 돌려준다 → 화면에서 "토지 진단으로 진행"해도 조회 횟수를 더 쓰지 않는다
        return fail("NO_BUILDING_REGISTER", MESSAGES.noBuildingRegister, { land: result.value.land });
      case "ok": {
        const { land, buildings } = result.value;
        return ok({
          land,
          // 토지 진단이면 null, 건물 진단이면 동 목록 (전체 개수가 보여준 것보다 많을 수 있음)
          buildings: buildings ? buildings.buildings : null,
          buildingsTotal: buildings ? buildings.total : null,
        });
      }
    }
  } catch (error) {
    if (error instanceof UpstreamError) {
      console.error("/api/lookup 공공 API 오류"); // 필지 번호·키는 남기지 않는다
      return fail("UPSTREAM_FAILED", MESSAGES.upstreamFailed);
    }
    console.error("/api/lookup 처리 중 오류");
    return serverError();
  }
}
