// 시뮬레이션 이미지 요청 글 시험 (lib/simulate-prompt.ts)
import { describe, expect, it } from "vitest";
import { BUILDING_THEMES, LAND_THEMES } from "../lib/themes";
import { buildSimulatePrompt, sceneFor } from "../lib/simulate-prompt";

describe("buildSimulatePrompt", () => {
  it("모든 테마에 설명이 있다 (테마 목록과 어긋나지 않게)", () => {
    for (const t of [...LAND_THEMES, ...BUILDING_THEMES]) expect(sceneFor(t), t).toBeTruthy();
  });
  it("구도 유지·사람·번호판·글자 금지 지시가 들어 있다", () => {
    const p = buildSimulatePrompt("공영주차장", "land")!;
    expect(p).toMatch(/camera angle/);
    expect(p).toMatch(/license plates/);
    expect(p).toMatch(/people, faces/);
    expect(p).toMatch(/text, signs, logos/);
  });
  it("토지는 땅을 바꾸고, 건물은 기존 건물을 리모델링한다", () => {
    expect(buildSimulatePrompt("태양광", "land")).toMatch(/vacant or neglected land/);
    expect(buildSimulatePrompt("공유오피스", "building")).toMatch(/existing building/);
  });
  it("모르는 테마는 null (이미지를 만들지 않는다)", () => {
    expect(buildSimulatePrompt("놀이공원", "land")).toBeNull();
  });
});
