// Design Ref: §4.1 — 신호등 판정 (순수 규칙: 화면·DB·AI 없이 값만 받아 값을 돌려준다)
// Plan SC: "위험한 오판정(매각 불가를 🟢로) 0건", "확실하지 않으면 🟢로 판정하지 않는다"
//
// 판정은 규칙표로만 한다. AI가 임의로 판단하지 않는다. (PRD must1 규칙 8, 11)
//   1) 🔴가 하나라도 있으면 🔴
//   2) 🟡가 하나라도 있으면 🟡 (빈 값·"모르겠음"·규칙표에 없는 값 포함)
//   3) 그 외에만 🟢
import { normalizeZoneName, normalizeZones } from "./normalize-zone";
import { questionText, questionsFor } from "./questions";
import type { Answer, Basis, JudgeInput, JudgeResult, QuestionKey, RuleCategory, RuleRow, Signal } from "./types";

const ANSWERS: readonly Answer[] = ["yes", "no", "unknown"];

type RuleIndex = Map<string, RuleRow>;

const keyOf = (category: RuleCategory, name: string) => `${category}:${normalizeZoneName(name)}`;

function indexRules(rules: readonly RuleRow[]): RuleIndex {
  const map: RuleIndex = new Map();
  for (const r of rules) map.set(keyOf(r.category, r.name), r);
  return map;
}

function fromRule(kind: RuleCategory, name: string, rule: RuleRow): Basis {
  return { kind, name, signal: rule.signal, reason: rule.reason, baseYear: rule.base_year };
}

/** 지목·용도지역·지역지구 한 항목을 규칙표에서 찾는다. 비었거나 표에 없으면 🟡. */
function checkItem(kind: RuleCategory, name: string, index: RuleIndex, label: string): Basis {
  const clean = normalizeZoneName(name);
  if (!clean) {
    return { kind, name: "(없음)", signal: "yellow", reason: `${label}을(를) 확인할 수 없어 담당자 상담이 필요합니다.` };
  }
  const rule = index.get(keyOf(kind, clean));
  if (!rule) {
    return { kind, name: clean, signal: "yellow", reason: `규칙표에 없는 ${label}이라 담당자 상담이 필요합니다: ${clean}` };
  }
  return fromRule(kind, clean, rule);
}

/** 보완 질문 한 개. 답이 없거나 "모르겠음"이면 🟡, 표에 없는 조합도 🟡. */
function checkQuestion(key: QuestionKey, answer: Answer | null | undefined, index: RuleIndex): Basis {
  const text = questionText(key);
  if (answer == null || !ANSWERS.includes(answer)) {
    return { kind: "질문", name: key, signal: "yellow", reason: `"${text}" 질문에 답하지 않아 담당자 상담이 필요합니다.` };
  }
  const rule = index.get(keyOf("질문", `${key}:${answer}`));
  let basis: Basis = rule
    ? fromRule("질문", `${key}:${answer}`, rule)
    : { kind: "질문", name: `${key}:${answer}`, signal: "yellow", reason: `"${text}" 답변에 대한 규칙이 없어 담당자 상담이 필요합니다.` };

  // PRD 고정 규칙: 규칙표 값과 상관없이 아래는 🟢가 될 수 없다.
  //  - "모르겠음"이 1개 이상이면 🟡 (규칙 11)
  //  - 국유재산 확인 질문은 "예"일 때만 통과 (규칙 10)
  const mustBeYellow = answer === "unknown" || (key === "onbid" && answer !== "yes");
  if (mustBeYellow && basis.signal === "green") {
    basis = { ...basis, signal: "yellow", reason: `"${text}" 질문이 확인되지 않아 담당자 상담이 필요합니다.` };
  }
  return basis;
}

export function judge(input: JudgeInput, rules: readonly RuleRow[]): JudgeResult {
  const index = indexRules(rules);
  const checked: Basis[] = [];

  checked.push(checkItem("지목", input.landCategory, index, "지목"));
  checked.push(checkItem("용도지역", input.zone, index, "용도지역"));
  for (const zone of normalizeZones(input.otherZones)) {
    checked.push(checkItem("지역지구", zone, index, "지역·지구"));
  }
  for (const q of questionsFor(input.type)) {
    checked.push(checkQuestion(q.key, input.answers?.[q.key], index));
  }

  const has = (s: Signal) => checked.some((b) => b.signal === s);
  const signal: Signal = has("red") ? "red" : has("yellow") ? "yellow" : "green";
  const reasons = signal === "green" ? checked : checked.filter((b) => b.signal === signal);
  const baseYears = [...new Set(checked.flatMap((b) => (b.baseYear != null ? [b.baseYear] : [])))].sort((a, b) => a - b);

  return { signal, reasons, checked, baseYears };
}
