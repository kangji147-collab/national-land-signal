// Design Ref: §4.1-1 — 지역·지구는 괄호 안 내용과 <법령 이름>을 떼어 낸 "이름"만으로 규칙표와 비교한다.
// 예) 상대보호구역(키즈포레유치원)<교육환경 보호에 관한 법률> → 상대보호구역
// PRD must1 규칙 9

// 괄호 ( ) （ ） 와 꺾쇠 < > ＜ ＞ 안쪽(괄호 포함)을 지운다.
const DECORATION = /\([^()]*\)|（[^（）]*）|<[^<>]*>|＜[^＜＞]*＞/g;
// 닫히지 않은 괄호가 남은 경우(글자가 잘린 서류) 열린 괄호부터 끝까지 지운다.
const UNCLOSED = /[(（<＜][^)）>＞]*$/;
// 지역·지구 여러 개가 한 줄에 붙어 있을 때의 구분자
const SEPARATORS = /[,，、;；\n\r]+/;

/** 괄호·꺾쇠 안 내용을 지운다. (바깥쪽 공백은 다듬음) */
export function stripZoneDecorations(raw: string): string {
  let s = String(raw ?? "");
  // 겹친 괄호도 처리하도록 더 이상 줄지 않을 때까지 반복
  for (let prev = ""; prev !== s; ) {
    prev = s;
    s = s.replace(DECORATION, "");
  }
  return s.replace(UNCLOSED, "").trim();
}

/** 규칙표와 비교하기 위한 이름: 괄호·꺾쇠 안 내용을 지우고 모든 공백을 없앤다. */
export function normalizeZoneName(raw: string): string {
  return stripZoneDecorations(raw).replace(/\s+/g, "");
}

/**
 * 지역·지구 문자열(또는 목록)을 이름 목록으로 바꾼다.
 * - 쉼표 등으로 붙은 여러 개를 나누고, 이름을 정리하고, 빈 값과 중복을 없앤다.
 * - 괄호를 먼저 지우므로 괄호 안의 쉼표 때문에 잘못 나뉘지 않는다.
 */
export function normalizeZones(input: string | readonly string[] | null | undefined): string[] {
  if (input == null) return [];
  const list = typeof input === "string" ? [input] : [...input];
  const out: string[] = [];
  for (const item of list) {
    for (const part of stripZoneDecorations(String(item)).split(SEPARATORS)) {
      const name = part.replace(/\s+/g, "");
      if (name && !out.includes(name)) out.push(name);
    }
  }
  return out;
}
