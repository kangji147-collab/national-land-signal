// Design Ref: §4 — 시뮬레이션 이미지 요청 글 만들기 (순수 규칙: 테마 → 이미지 편집 지시)
// OpenAI 이미지 편집에는 "현장 사진 + 이 글"만 보낸다. 주소·면적·소유자 정보 등은 글에 넣지 않는다.
// 글은 영어로 쓴다 (이미지 모델이 가장 안정적으로 따른다). 민원인에게 보여주지 않는다.
import type { PropertyType } from "./types";

/** 테마별 "개발 후 모습" 설명 */
const SCENES: Record<string, string> = {
  공영주차장:
    "a neatly paved public parking lot with clearly painted parking bays, wheel stops, light poles and a small attendant booth, with only a few generic parked cars",
  스마트팜:
    "a modern smart farm with rows of clean greenhouse structures and indoor vertical-farming facilities, tidy gravel paths and irrigation equipment",
  태양광:
    "a tidy ground-mounted solar power site with neat rows of photovoltaic panels on steel frames, a small inverter cabin and a perimeter fence",
  소공원:
    "a small neighborhood pocket park with a well-kept lawn, young trees, flower beds, a paved walking path, benches and a shade pergola",
  공유오피스:
    "the same building renovated into a bright modern co-working office: refreshed facade, large clean glass windows, a welcoming entrance and a small landscaped front area",
  청년주택:
    "the same building renovated into youth housing: refreshed warm-toned facade, new windows and balconies, a tidy entrance and bicycle racks",
  "카페/문화공간":
    "the same building renovated into a cafe and cultural space: warm inviting facade, large windows, an outdoor terrace with tables and plants, no readable signage",
  "창고(물류)":
    "the same building renovated into a clean logistics warehouse: repainted facade, loading docks with roll-up doors, a paved yard for trucks",
};

/** 테마의 개발 후 모습 설명. 모르는 테마는 null (그 경우 이미지를 만들지 않는다) */
export function sceneFor(theme: string): string | null {
  return SCENES[theme] ?? null;
}

/** 이미지 편집 요청 글. 모르는 테마면 null */
export function buildSimulatePrompt(theme: string, type: PropertyType): string | null {
  const scene = sceneFor(theme);
  if (!scene) return null;
  return [
    "Edit this real photo of a site into a realistic 'after development' visualization.",
    `Target: ${scene}.`,
    type === "land"
      ? "The photo shows vacant or neglected land: transform the land itself."
      : "The photo shows an existing building: keep its basic shape, position and size, and show it renovated.",
    "Keep the camera angle, framing, perspective, lighting, sky, and the surrounding roads, buildings and trees exactly as in the original photo.",
    "Photorealistic, natural daylight, looks like an actual photograph.",
    "Do not add any people, faces, readable license plates, text, signs, logos or watermarks.",
  ].join(" ");
}
