// 시험 사례 20건 점검 도구 (PLAN 작업 1번, DESIGN §9)
// 실행: node tests/cases/check-cases.mjs
// 하는 일: tests/cases/*.json 을 읽어 ① 구성(토지 15 + 건물 5) ② 입력 진행 상황
//          ③ 🟢🟡🔴 분포 ④ 서류 파일 존재 여부 ⑤ 잘못된 값 을 한국어로 알려 준다.
// 새 라이브러리 없이 Node 기본 기능만 쓴다. 파일을 고치지는 않는다(읽기만).

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const casesDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(casesDir, "..", "..");

const WANT = { land: 20, building: 5 }; // 토지 20 = 처음 15건 + 🟢 기능 시험용 5건(land-16~20, 2026-11-12 추가)
const SIGNALS = ["green", "yellow", "red"];
const SIGNAL_ICON = { green: "🟢", yellow: "🟡", red: "🔴" };
const ANSWERS = ["yes", "no", "unknown"];

const errors = []; // 잘못된 값 (고쳐야 함)
const todo = []; // 아직 안 채운 값 (진행 중이면 정상)
const notes = []; // 참고
const detail = []; // 남은 칸의 자세한 이름 (--all 로 볼 때)

const files = readdirSync(casesDir)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .sort();

const empty = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

const cases = [];
for (const f of files) {
  let data;
  try {
    data = JSON.parse(readFileSync(join(casesDir, f), "utf8"));
  } catch (e) {
    errors.push(`${f}: JSON 모양이 깨졌어요 (${e.message})`);
    continue;
  }
  cases.push({ file: f, data });
}

const ids = new Set();
const typeCount = { land: 0, building: 0 };
const signalCount = { land: { green: 0, yellow: 0, red: 0 }, building: { green: 0, yellow: 0, red: 0 } };
let completed = 0;

for (const { file, data: c } of cases) {
  const name = file.replace(/\.json$/, "");
  if (c.id !== name) errors.push(`${file}: id("${c.id}")가 파일 이름과 달라요`);
  if (ids.has(c.id)) errors.push(`${file}: id "${c.id}"가 중복이에요`);
  ids.add(c.id);

  if (c.type !== "land" && c.type !== "building") {
    errors.push(`${file}: type은 land 또는 building 이어야 해요`);
    continue;
  }
  typeCount[c.type]++;

  const missing = [];

  // 토지이용계획에서 읽는 6개 항목
  const ex = c.extracted ?? {};
  for (const k of ["address", "landCategory", "area", "officialPrice", "zone"]) {
    if (empty(ex[k])) missing.push(`extracted.${k}`);
  }
  if (!Array.isArray(ex.otherZones)) errors.push(`${file}: extracted.otherZones는 목록([])이어야 해요`);

  // 건물이면 건축물대장 5개 항목 (소유자 칸은 없어야 함)
  if (c.type === "building") {
    const b = c.building;
    if (!b) {
      missing.push("building");
    } else {
      for (const k of ["address", "mainUse", "totalFloorArea", "floors", "structure", "approvalDate"]) {
        if (empty(b[k])) missing.push(`building.${k}`);
      }
      if ("owner" in b || "ownerName" in b) errors.push(`${file}: 소유자 칸은 적지 않아요 (개인정보)`);
    }
  } else if (c.building) {
    errors.push(`${file}: 토지 사례인데 building 칸이 채워져 있어요`);
  }

  // 보완 질문 답
  const a = c.answers ?? {};
  const keys = c.type === "building" ? ["onbid", "dispute", "inUse", "safety"] : ["onbid", "dispute", "inUse"];
  for (const k of keys) {
    if (empty(a[k])) missing.push(`answers.${k}`);
    else if (!ANSWERS.includes(a[k])) errors.push(`${file}: answers.${k}는 yes / no / unknown 중 하나여야 해요 (지금: ${a[k]})`);
  }

  // 정답 신호
  if (empty(c.expectedSignal)) missing.push("expectedSignal");
  else if (!SIGNALS.includes(c.expectedSignal)) errors.push(`${file}: expectedSignal은 green / yellow / red 중 하나여야 해요`);
  else signalCount[c.type][c.expectedSignal]++;
  if (empty(c.expectedReason)) missing.push("expectedReason");

  // 서류 원본 파일 (있으면 좋음 — 없으면 알림만)
  const docs = [c.sourceDoc, c.type === "building" ? c.sourceDocBuilding : null].filter(Boolean);
  for (const d of docs) {
    // 확장자는 pdf/png/jpg 중 무엇이든 인정
    const base = d.replace(/\.[^.]+$/, "");
    const found = ["pdf", "png", "jpg", "jpeg"].some((ext) => existsSync(join(root, `${base}.${ext}`)));
    if (!found) missing.push(`서류 파일 없음: ${base}.(pdf|png|jpg)`);
  }

  if (missing.length === 0) completed++;
  else {
    const docMissing = missing.filter((m) => m.startsWith("서류 파일")).length;
    const dataMissing = missing.length - docMissing;
    const parts = [];
    if (dataMissing) parts.push(`입력 ${dataMissing}칸`);
    if (docMissing) parts.push(`서류 파일 ${docMissing}개`);
    todo.push(`${c.id}: ${parts.join(" · ")} 남음`);
    detail.push(`${c.id}: ${missing.join(", ")}`);
  }
}

// ---- 구성 점검 ----
for (const t of ["land", "building"]) {
  if (typeCount[t] !== WANT[t]) errors.push(`${t === "land" ? "토지" : "건물"} 사례가 ${typeCount[t]}건이에요 (목표 ${WANT[t]}건)`);
}

// ---- 출력 ----
const bar = (n, total) => `${"■".repeat(n)}${"□".repeat(total - n)}`;
console.log("\n=== 시험 사례 점검 (PLAN 작업 1번) ===\n");
console.log(`구성   토지 ${typeCount.land}/${WANT.land}건 · 건물 ${typeCount.building}/${WANT.building}건`);
console.log(`완료   ${bar(completed, 20)} ${completed}/20건 (모든 칸 + 서류 파일까지 채운 사례)\n`);

console.log("정답 신호 분포 (입력된 것만)");
for (const t of ["land", "building"]) {
  const s = signalCount[t];
  console.log(`  ${t === "land" ? "토지" : "건물"}  ${SIGNAL_ICON.green} ${s.green}  ${SIGNAL_ICON.yellow} ${s.yellow}  ${SIGNAL_ICON.red} ${s.red}`);
}
const total = (k) => signalCount.land[k] + signalCount.building[k];
console.log(`  합계  ${SIGNAL_ICON.green} ${total("green")}  ${SIGNAL_ICON.yellow} ${total("yellow")}  ${SIGNAL_ICON.red} ${total("red")}`);
if (completed > 0 || total("green") + total("yellow") + total("red") === 20) {
  for (const k of SIGNALS) if (total(k) === 0) notes.push(`${SIGNAL_ICON[k]} 사례가 하나도 없어요. 🟢🟡🔴가 골고루 섞이게 해 주세요.`);
}

// "위험한 오판정" 시험에는 🔴 정답 사례가 꼭 필요하다.
if (total("red") > 0 && total("red") < 3) notes.push("🔴 정답 사례가 3건 미만이에요. 위험한 오판정(🔴→🟢) 시험을 하려면 더 필요해요.");

console.log("\n아직 채우지 않은 사례");
if (todo.length === 0) console.log("  없음 ✅");
else {
  const all = process.argv.includes("--all");
  const SHOW = 8;
  (all ? todo : todo.slice(0, SHOW)).forEach((t) => console.log(`  - ${t}`));
  if (!all && todo.length > SHOW) console.log(`  … 외 ${todo.length - SHOW}건`);
  if (all) {
    console.log("\n칸 이름까지 자세히");
    detail.forEach((d) => console.log(`  - ${d}`));
  } else {
    console.log("  (칸 이름까지 보려면: node tests/cases/check-cases.mjs --all)");
  }
}

if (notes.length) {
  console.log("\n참고");
  notes.forEach((n) => console.log(`  • ${n}`));
}

if (errors.length) {
  console.log("\n❌ 고쳐야 할 것");
  errors.forEach((e) => console.log(`  - ${e}`));
  console.log("");
  process.exit(1);
}
console.log(completed === 20 ? "\n✅ 사례 20건이 모두 준비됐어요. 작업 1번 완료!\n" : "\n(진행 중이에요. 위 항목을 채우고 다시 실행해 보세요.)\n");
