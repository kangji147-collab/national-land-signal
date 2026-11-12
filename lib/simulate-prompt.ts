// Design Ref: §4 — 시뮬레이션 이미지 요청 글 만들기 (순수 규칙: 테마 → 이미지 편집 지시)
// OpenAI 이미지 편집에는 "현장 사진 + 이 글"만 보낸다. 주소·면적·소유자 정보 등은 글에 넣지 않는다.
// 글은 영어로 쓴다 (이미지 모델이 가장 안정적으로 따른다). 민원인에게 보여주지 않는다.
import type { LayoutItem } from "./layout";
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

/** 민원인이 사진 위에 놓은 시설물 하나 (위치는 사진 가로·세로에 대한 0~1 비율) */
export interface LayoutPlanItem {
  name: string;
  x: number;
  y: number;
}

/** 위치(0~1)를 영어 말로: 가로 left/center/right, 세로는 원근(위쪽=먼 곳, 아래쪽=가까운 곳) */
export function describePosition(x: number, y: number): string {
  const h = x < 0.34 ? "left" : x < 0.67 ? "center" : "right";
  const v = y < 0.4 ? "background (upper part of the frame, far from the camera)" : y < 0.7 ? "midground" : "foreground (lower part of the frame, close to the camera)";
  return `${h} ${v}`;
}

const MAX_PLAN_LINES = 40; // 요청 글이 너무 길어지지 않게

/** 배치 계획을 영어 글로. 같은 시설물은 모아서 "개수 + 위치 목록"으로 쓴다. 배치가 없으면 null */
export function describeLayoutPlan(plan: readonly LayoutPlanItem[], items: readonly LayoutItem[]): string | null {
  if (plan.length === 0) return null;
  const byName = new Map(items.map((i) => [i.name, i]));
  const groups = new Map<string, LayoutPlanItem[]>();
  for (const p of plan) {
    if (!byName.has(p.name)) continue;
    groups.set(p.name, [...(groups.get(p.name) ?? []), p]);
  }
  const lines: string[] = [];
  for (const item of items) {
    const list = groups.get(item.name);
    if (!list) continue;
    const what = item.descriptionEn?.trim() || item.name;
    const where = list
      .slice(0, MAX_PLAN_LINES)
      .map((p) => describePosition(p.x, p.y))
      .join("; ");
    lines.push(`- exactly ${list.length} × ${what}: at ${where}`);
  }
  return lines.length === 0 ? null : lines.join("\n");
}

/**
 * 이미지 편집 요청 글. 모르는 테마면 null.
 * plan(민원인이 직접 배치한 시설물)이 있으면 그 개수·위치대로 그리라고 지시한다. guideImage=true 이면 두 번째 그림(이름표가 붙은 배치도)을 참고용으로 함께 보낸다.
 */
export function buildSimulatePrompt(
  theme: string,
  type: PropertyType,
  layout?: { plan: readonly LayoutPlanItem[]; items: readonly LayoutItem[]; guideImage: boolean },
): string | null {
  const scene = sceneFor(theme);
  if (!scene) return null;
  const planText = layout ? describeLayoutPlan(layout.plan, layout.items) : null;
  const parts = [
    "Edit this real photo of a site into a realistic 'after development' visualization.",
    `Target: ${scene}.`,
    type === "land"
      ? "The photo shows vacant or neglected land: transform the land itself."
      : "The photo shows an existing building: keep its basic shape, position and size, and show it renovated.",
  ];
  if (planText) {
    parts.push(
      "IMPORTANT: the site owner has already chosen the exact arrangement of facilities. Draw ONLY these facilities, in exactly these counts and at these positions (positions are relative to the photo frame), and do not add other major facilities. Keep the rest of the land as simple paving, gravel or lawn:",
      planText,
    );
    if (layout?.guideImage) {
      parts.push(
        "The second image is the same photo with small labeled markers showing where each facility goes. Use it only as a placement guide to match the positions and counts. Never draw the markers, tags, labels or any text in the result.",
      );
    }
  }
  parts.push(
    "Keep the camera angle, framing, perspective, lighting, sky, and the surrounding roads, buildings and trees exactly as in the original photo.",
    "Photorealistic, natural daylight, looks like an actual photograph.",
    "Do not add any people, faces, readable license plates, text, signs, logos or watermarks.",
  );
  return parts.join(" ");
}
