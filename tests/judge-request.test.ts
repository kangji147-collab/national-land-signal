// 판정 요청 만들기 시험 (lib/judge-request.ts)
import { describe, expect, it } from "vitest";
import { buildJudgeRequest, regionOf } from "../lib/judge-request";
import { JudgeRequestSchema, toJudgeInput } from "../lib/judge-schema";

const base = {
  mode: "land" as const,
  landCategory: "대",
  zone: "일반상업지역",
  zones: ["도로", "서울도심"],
  area: 500,
  address: "서울특별시 중구 태평로1가 31",
};

describe("판정 요청 만들기", () => {
  it("확인·수정한 값과 답을 판정 요청 모양으로 옮긴다", () => {
    expect(buildJudgeRequest(base, { onbid: "yes", dispute: "no", inUse: "unknown" })).toEqual({
      type: "land",
      landCategory: "대",
      zone: "일반상업지역",
      otherZones: ["도로", "서울도심"],
      answers: { onbid: "yes", dispute: "no", inUse: "unknown" },
      area: 500,
      region: "metro",
    });
  });

  it("토지는 안전진단 답을 보내지 않는다 (건물 진단 때의 답이 남아 있어도)", () => {
    const r = buildJudgeRequest(base, { onbid: "yes", dispute: "no", inUse: "no", safety: "yes" });
    expect(r.answers).toEqual({ onbid: "yes", dispute: "no", inUse: "no" });
  });

  it("건물은 안전진단 답까지 보낸다", () => {
    const r = buildJudgeRequest({ ...base, mode: "building" }, { onbid: "yes", dispute: "no", inUse: "no", safety: "no" });
    expect(r.type).toBe("building");
    expect(r.answers.safety).toBe("no");
  });

  it("비었거나 이상한 답은 담지 않는다 (판정에서 '답 없음'으로 🟡 처리됨)", () => {
    const r = buildJudgeRequest(base, { onbid: null, dispute: undefined, inUse: "maybe" as never });
    expect(r.answers).toEqual({});
  });

  it("지역지구 목록을 복사해서 보낸다 (원본을 바꾸지 않음)", () => {
    const zones = ["도로"];
    const r = buildJudgeRequest({ ...base, zones }, {});
    r.otherZones.push("추가");
    expect(zones).toEqual(["도로"]);
  });
});

describe("소재지 구분 (면적 규칙용)", () => {
  it("특별시·광역시는 metro, 그 밖의 시·군·세종은 other", () => {
    for (const a of ["서울특별시 중구 태평로1가 31", "부산광역시 해운대구 우동 1", "대구광역시 동구 둔산동 590-4", "인천광역시 남동구 구월동 1286-14", "광주광역시 서구 치평동 1", "대전광역시 서구 둔산동 1", "울산광역시 남구 삼산동 1", "서울 중구 태평로1가 31"]) {
      expect(regionOf(a), a).toBe("metro");
    }
    for (const a of ["경기도 수원시 팔달구 인계동 951-6", "강원특별자치도 강릉시 강문동 1-1", "세종특별자치시  어진동 565", "경상북도 영천시 금호읍 교대리 1-10", "제주특별자치도 서귀포시 안덕면 사계리 1"]) {
      expect(regionOf(a), a).toBe("other");
    }
  });
  it("주소를 알 수 없으면 기준이 더 엄격한 metro", () => {
    expect(regionOf("")).toBe("metro");
    expect(regionOf("   ")).toBe("metro");
  });
  it("판정 요청에는 주소 글자가 아니라 구분만 담긴다", () => {
    const r = buildJudgeRequest(base, {});
    expect(JSON.stringify(r)).not.toContain("태평로");
    expect(r.region).toBe("metro");
    expect(r.area).toBe(500);
  });
});

describe("서버 검사와 맞물린다", () => {
  it("만든 요청은 서버 검사를 통과하고 판정 입력으로 바뀐다", () => {
    const req = buildJudgeRequest(base, { onbid: "yes", dispute: "no", inUse: "no" });
    const parsed = JudgeRequestSchema.parse(req);
    expect(toJudgeInput(parsed)).toEqual({
      type: "land",
      landCategory: "대",
      zone: "일반상업지역",
      otherZones: ["도로", "서울도심"],
      answers: { onbid: "yes", dispute: "no", inUse: "no" },
      area: 500,
      region: "metro",
    });
  });
  it("면적이 0 이하이거나 소재지 구분이 이상하면 서버가 거절한다", () => {
    const ok = buildJudgeRequest(base, {});
    expect(JudgeRequestSchema.safeParse({ ...ok, area: 0 }).success).toBe(false);
    expect(JudgeRequestSchema.safeParse({ ...ok, area: -5 }).success).toBe(false);
    expect(JudgeRequestSchema.safeParse({ ...ok, region: "abroad" }).success).toBe(false);
    // 면적·구분이 없는 예전 모양도 받는다 (면적 규칙만 적용하지 않음)
    const old: Record<string, unknown> = { ...ok };
    delete old.area;
    delete old.region;
    expect(JudgeRequestSchema.safeParse(old).success).toBe(true);
  });
});
