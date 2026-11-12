// Design Ref: §5 — Supabase 관리 표(규칙표·상담 연락처)를 읽어 온다. 읽기만 하며 웹(anon 키)에서는 수정할 수 없다.
// 판정은 이 표로만 한다. (PRD must 1 규칙 8, 14) 읽을 때마다 새로 가져와서 관리자가 고친 내용이 바로 반영된다.
//
// 약속: 표를 읽지 못했거나 값이 이상하면 "빈 규칙으로 판정"하지 않고 오류를 던진다.
//       (규칙이 비면 안전 방향인 🟡이 되긴 하지만, 오류인 줄 모르고 결과를 믿게 되므로 알리는 것이 맞다)
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriceRow } from "./calc";
import type { LayoutItem } from "./layout";
import { normalizeZoneName } from "./normalize-zone";
import { type Theme, themesFor } from "./themes";
import type { PropertyType, RuleCategory, RuleRow, Signal } from "./types";

export class RulesSourceError extends Error {
  constructor(what: string) {
    super(`규칙표 읽기 오류: ${what}`); // 표 내용·키는 메시지에 넣지 않는다
    this.name = "RulesSourceError";
  }
}

/** 상담 연락처 (🟡 안내에 보여줄 대표 연락처 1개) */
export interface Contact {
  name: string;
  phone: string;
  hours: string;
}

const CATEGORIES: readonly RuleCategory[] = ["지목", "용도지역", "지역지구", "질문", "면적"];
const SIGNALS: readonly Signal[] = ["green", "yellow", "red"];

// Supabase 는 한 번에 최대 1000줄까지만 돌려준다. 그만큼 받았다면 뒤가 잘렸을 수 있으므로 오류로 본다.
export const MAX_RULE_ROWS = 1000;

export async function fetchRules(client: SupabaseClient): Promise<RuleRow[]> {
  const { data, error } = await client
    .from("rules")
    .select("category,name,signal,reason,base_year")
    .range(0, MAX_RULE_ROWS - 1);
  if (error || !Array.isArray(data)) throw new RulesSourceError("규칙표를 읽지 못했어요");
  if (data.length >= MAX_RULE_ROWS) throw new RulesSourceError("규칙표가 너무 커서 일부가 잘렸을 수 있어요");

  return data.map((row: Record<string, unknown>) => {
    const { category, name, signal, reason, base_year } = row;
    if (
      !CATEGORIES.includes(category as RuleCategory) ||
      typeof name !== "string" ||
      !SIGNALS.includes(signal as Signal) ||
      typeof reason !== "string" ||
      typeof base_year !== "number"
    ) {
      throw new RulesSourceError("규칙표에 이상한 줄이 있어요");
    }
    return { category: category as RuleCategory, name, signal: signal as Signal, reason, base_year };
  });
}

/** 상담 연락처 1개. 표가 비어 있으면 null (화면은 일반 안내 문구로 대신한다) */
export async function fetchContact(client: SupabaseClient): Promise<Contact | null> {
  const { data, error } = await client.from("contacts").select("name,phone,hours").limit(1);
  if (error || !Array.isArray(data)) throw new RulesSourceError("상담 연락처를 읽지 못했어요");
  const row = data[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  if (typeof row.name !== "string" || typeof row.phone !== "string" || typeof row.hours !== "string") {
    throw new RulesSourceError("상담 연락처에 이상한 값이 있어요");
  }
  return { name: row.name, phone: row.phone, hours: row.hours };
}

/**
 * 테마 허용표에서 이 용도지역에 허용된 테마만 돌려준다. (대상: 토지/건물, 목록 순서는 lib/themes.ts 의 순서)
 *  - 관리자가 표에 괄호·법령 이름이 붙은 이름을 적어도 맞도록 양쪽 모두 정리해서 비교한다.
 *  - 용도지역이 비었거나 표에 없으면 빈 목록. (테마를 보여주지 않는다)
 *  - 표를 읽지 못했거나 이상한 줄이 있으면 오류를 던진다.
 */
export async function fetchAllowedThemes(client: SupabaseClient, type: PropertyType, zone: string): Promise<Theme[]> {
  const wanted = normalizeZoneName(zone);
  const { data, error } = await client
    .from("theme_permissions")
    .select("target,zone,theme")
    .eq("target", type)
    .range(0, MAX_RULE_ROWS - 1);
  if (error || !Array.isArray(data)) throw new RulesSourceError("테마 허용표를 읽지 못했어요");
  if (data.length >= MAX_RULE_ROWS) throw new RulesSourceError("테마 허용표가 너무 커서 일부가 잘렸을 수 있어요");
  if (!wanted) return [];

  const allowed = new Set<string>();
  for (const row of data as Record<string, unknown>[]) {
    if (typeof row.zone !== "string" || typeof row.theme !== "string" || row.target !== type) {
      throw new RulesSourceError("테마 허용표에 이상한 줄이 있어요");
    }
    if (normalizeZoneName(row.zone) === wanted) allowed.add(row.theme);
  }
  // 이 진단 종류의 전체 목록 순서대로, 목록에 있는 테마만
  return themesFor(type).filter((t) => allowed.has(t));
}

/**
 * 단가표(unit_prices)를 모두 읽는다. 예상 수익 계산(lib/calc.ts)에 쓴다.
 *  - 표를 읽지 못했거나 이상한 줄이 있으면 오류를 던진다. (비어 있는 표로 계산하지 않음)
 */
export async function fetchPrices(client: SupabaseClient): Promise<PriceRow[]> {
  const { data, error } = await client
    .from("unit_prices")
    .select("theme,item,min_value,max_value,unit,source,base_year")
    .range(0, MAX_RULE_ROWS - 1);
  if (error || !Array.isArray(data)) throw new RulesSourceError("단가표를 읽지 못했어요");
  if (data.length >= MAX_RULE_ROWS) throw new RulesSourceError("단가표가 너무 커서 일부가 잘렸을 수 있어요");

  return data.map((row: Record<string, unknown>) => {
    // numeric 열은 글자로 올 수 있어 숫자로 바꿔 검사한다
    const min = Number(row.min_value);
    const max = Number(row.max_value);
    const year = Number(row.base_year);
    if (
      typeof row.theme !== "string" ||
      typeof row.item !== "string" ||
      typeof row.unit !== "string" ||
      typeof row.source !== "string" ||
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      !Number.isFinite(year) ||
      min < 0 ||
      max < min
    ) {
      throw new RulesSourceError("단가표에 이상한 줄이 있어요");
    }
    return { theme: row.theme, item: row.item, min_value: min, max_value: max, unit: row.unit, source: row.source, base_year: year };
  });
}

/**
 * 기대효과 문장표에서 이 테마의 기본 문장을 정렬 순서대로 읽는다. (최대 50개)
 *  - 표를 읽지 못했거나 이상한 줄이 있으면 오류를 던진다. 이 테마의 문장이 없으면 빈 목록.
 */
export async function fetchEffectSentences(client: SupabaseClient, theme: string): Promise<string[]> {
  const { data, error } = await client
    .from("effect_sentences")
    .select("sentence,sort_order")
    .eq("theme", theme)
    .order("sort_order", { ascending: true })
    .range(0, 49);
  if (error || !Array.isArray(data)) throw new RulesSourceError("기대효과 문장표를 읽지 못했어요");
  return data.map((row: Record<string, unknown>) => {
    if (typeof row.sentence !== "string" || row.sentence.trim() === "") {
      throw new RulesSourceError("기대효과 문장표에 이상한 줄이 있어요");
    }
    return row.sentence.trim();
  });
}

/** 배치 시뮬레이터 시설물 표(layout_items)에서 이 테마의 시설물을 읽는다. 표에 없으면 빈 목록(=배치 기능 없이 진행) */
export async function fetchLayoutItems(client: SupabaseClient, theme: string): Promise<LayoutItem[]> {
  const { data, error } = await client
    .from("layout_items")
    .select("theme,name,icon,area_m2,units,unit_label,sort_order,description_en")
    .eq("theme", theme)
    .range(0, MAX_RULE_ROWS - 1);
  if (error || !Array.isArray(data)) throw new RulesSourceError("시설물 표를 읽지 못했어요");
  if (data.length >= MAX_RULE_ROWS) throw new RulesSourceError("시설물 표가 너무 커서 일부가 잘렸을 수 있어요");

  return data.map((row: Record<string, unknown>) => {
    // numeric 열은 글자로 올 수 있어 숫자로 바꿔 검사한다
    const area = Number(row.area_m2);
    const units = Number(row.units);
    const order = Number(row.sort_order);
    if (
      row.theme !== theme ||
      typeof row.name !== "string" ||
      row.name === "" ||
      typeof row.icon !== "string" ||
      typeof row.unit_label !== "string" ||
      !Number.isFinite(area) ||
      area <= 0 ||
      !Number.isFinite(units) ||
      units < 0 ||
      !Number.isFinite(order)
    ) {
      throw new RulesSourceError("시설물 표에 이상한 줄이 있어요");
    }
    const descriptionEn = typeof row.description_en === "string" ? row.description_en : "";
    return { theme, name: row.name, icon: row.icon, areaM2: area, units, unitLabel: row.unit_label, sortOrder: order, descriptionEn };
  });
}
