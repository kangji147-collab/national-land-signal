// 판정 요청 만들기 시험 (lib/judge-request.ts)
import { describe, expect, it } from "vitest";
import { buildJudgeRequest } from "../lib/judge-request";
import { JudgeRequestSchema, toJudgeInput } from "../lib/judge-schema";

const base = {
  mode: "land" as const,
  landCategory: "대",
  zone: "일반상업지역",
  zones: ["도로", "서울도심"],
};

describe("판정 요청 만들기", () => {
  it("확인·수정한 값과 답을 판정 요청 모양으로 옮긴다", () => {
    expect(buildJudgeRequest(base, { onbid: "yes", dispute: "no", inUse: "unknown" })).toEqual({
      type: "land",
      landCategory: "대",
      zone: "일반상업지역",
      otherZones: ["도로", "서울도심"],
      answers: { onbid: "yes", dispute: "no", inUse: "unknown" },
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
    });
  });
});
