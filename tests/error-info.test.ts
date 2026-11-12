// 오류 종류별 화면 안내 규칙 시험 (app/diagnose/_components/error-info.ts)
import { describe, expect, it } from "vitest";
import { ERROR_STATUS } from "../lib/api-response";
import { describeError } from "../app/diagnose/_components/error-info";

describe("못 찾았을 때 — 진행을 멈추고 안내 (다시 시도 버튼 없음)", () => {
  it("주소를 못 찾으면 검색 요령을 알려 준다", () => {
    const i = describeError("ADDRESS_NOT_FOUND");
    expect(i.retryable).toBe(false); // 같은 주소를 다시 보내도 결과가 같다
    expect(i.exhausted).toBe(false);
    expect(i.hint).toContain("도로명");
    expect(i.hint).toContain("시·구·동");
  });

  it("토지 정보를 못 찾으면 다른 필지를 고르거나 다시 검색하라고 한다", () => {
    const i = describeError("LAND_INFO_NOT_FOUND");
    expect(i.retryable).toBe(false);
    expect(i.hint).toContain("다른 필지");
  });

  it("건축물대장이 없으면 토지 진단으로 이어갈 수 있다고 알려 주고, 횟수를 더 쓰지 않는다고 밝힌다", () => {
    const i = describeError("NO_BUILDING_REGISTER");
    expect(i.retryable).toBe(false);
    expect(i.hint).toContain("토지 진단");
    expect(i.hint).toContain("횟수는 더 쓰지 않아요");
  });
});

describe("잠시 뒤 다시 하면 될 수 있는 오류 — '다시 시도' 버튼 + 횟수 차감 없음 안내", () => {
  it.each(["UPSTREAM_FAILED", "SERVER_ERROR", "AI_FAILED", "NETWORK", "TIMEOUT"])("%s", (code) => {
    const i = describeError(code);
    expect(i.retryable).toBe(true);
    expect(i.exhausted).toBe(false);
    expect(i.hint).toContain("차감되지 않아요");
  });
});

describe("횟수를 모두 쓴 경우", () => {
  it("다시 시도 버튼은 없고(눌러도 소용없음), '오늘은 여기까지' 상태로 표시한다", () => {
    expect(describeError("LIMIT_EXCEEDED")).toEqual({ hint: null, retryable: false, exhausted: true });
  });
});

describe("그 밖의 오류", () => {
  it("입력이 잘못됐거나 모르는 코드는 다시 시도 버튼을 보여주지 않는다 (안내 문구만)", () => {
    expect(describeError("VALIDATION_ERROR")).toEqual({ hint: null, retryable: false, exhausted: false });
    expect(describeError("뭔지 모름")).toEqual({ hint: null, retryable: false, exhausted: false });
  });

  it("서버가 돌려주는 모든 오류 코드에 대해 안내 규칙이 정해져 있다 (새 코드가 생기면 여기서 알게 됨)", () => {
    const retryable = Object.keys(ERROR_STATUS).filter((c) => describeError(c).retryable).sort();
    expect(retryable).toEqual(["AI_FAILED", "SERVER_ERROR", "UPSTREAM_FAILED"]);
    const exhausted = Object.keys(ERROR_STATUS).filter((c) => describeError(c).exhausted);
    expect(exhausted).toEqual(["LIMIT_EXCEEDED"]);
  });
});
