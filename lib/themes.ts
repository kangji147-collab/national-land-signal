// PRD must2 규칙 2 — 선택할 수 있는 개발 테마 (토지 4개, 건물 4개)
// 어떤 용도지역에서 어떤 테마를 보여줄지는 Supabase 테마 허용표가 정한다. 여기는 "전체 목록"만 둔다.
import type { PropertyType } from "./types";

export const LAND_THEMES = ["공영주차장", "스마트팜", "태양광", "소공원"] as const;
export const BUILDING_THEMES = ["공유오피스", "청년주택", "카페/문화공간", "창고(물류)"] as const;

export type LandTheme = (typeof LAND_THEMES)[number];
export type BuildingTheme = (typeof BUILDING_THEMES)[number];
export type Theme = LandTheme | BuildingTheme;

export function themesFor(type: PropertyType): readonly Theme[] {
  return type === "land" ? LAND_THEMES : BUILDING_THEMES;
}

/** 테마가 토지용인지 건물용인지 (목록에 없으면 null) */
export function themeTarget(theme: string): PropertyType | null {
  if ((LAND_THEMES as readonly string[]).includes(theme)) return "land";
  if ((BUILDING_THEMES as readonly string[]).includes(theme)) return "building";
  return null;
}
