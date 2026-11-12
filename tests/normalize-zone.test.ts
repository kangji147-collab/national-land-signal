import { describe, expect, it } from "vitest";
import { normalizeZoneName, normalizeZones } from "../lib/normalize-zone";

describe("지역·지구 이름 정리", () => {
  it("PRD 예시: 괄호와 <법령 이름>을 뗀다", () => {
    expect(normalizeZoneName("상대보호구역(키즈포레유치원)<교육환경 보호에 관한 법률>")).toBe("상대보호구역");
  });

  it("괄호가 여러 개여도(날짜 포함) 이름만 남긴다", () => {
    expect(normalizeZoneName("가축사육제한구역(전 지역)(2011.03.29.)<가축분뇨의 관리 및 이용에 관한 법률>")).toBe("가축사육제한구역");
  });

  it("겹친 괄호도 처리한다", () => {
    expect(normalizeZoneName("대공방어협조구역(위탁고도:77-257m(예시))")).toBe("대공방어협조구역");
  });

  it("전각 괄호·꺾쇠도 처리한다", () => {
    expect(normalizeZoneName("개발제한구역（그린벨트）＜개발제한구역법＞")).toBe("개발제한구역");
  });

  it("닫히지 않은 괄호(글자가 잘린 서류)는 열린 괄호부터 지운다", () => {
    expect(normalizeZoneName("상대보호구역(키즈포레유")).toBe("상대보호구역");
  });

  it("이름 안 공백은 없앤다 (규칙표와 같은 모양으로 비교)", () => {
    expect(normalizeZoneName(" 제2종 일반주거지역 ")).toBe("제2종일반주거지역");
  });

  it("괄호가 없으면 그대로 둔다", () => {
    expect(normalizeZoneName("도시지역")).toBe("도시지역");
  });

  it("빈 값·null은 빈 문자열/빈 목록", () => {
    expect(normalizeZoneName("")).toBe("");
    expect(normalizeZones(null)).toEqual([]);
    expect(normalizeZones(undefined)).toEqual([]);
    expect(normalizeZones("")).toEqual([]);
  });

  it("쉼표로 붙은 여러 개를 나눈다 (괄호 안 쉼표는 나누지 않는다)", () => {
    expect(
      normalizeZones("상대보호구역(A유치원, B학교)<교육환경법>, 가축사육제한구역<가축분뇨법>, 도시지역"),
    ).toEqual(["상대보호구역", "가축사육제한구역", "도시지역"]);
  });

  it("목록도 받고, 중복과 빈 값은 없앤다", () => {
    expect(normalizeZones(["도시지역", "도시지역(중복)", "", "  ", "과밀억제권역<수도권정비계획법>"])).toEqual([
      "도시지역",
      "과밀억제권역",
    ]);
  });
});
