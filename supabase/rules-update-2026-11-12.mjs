// 규칙표 보강 (2026-11-12, 작업 22번 후속) — 실행: node supabase/rules-update-2026-11-12.mjs [--apply]
// 하는 일: 아래 목록으로 ① supabase/migrations/003_rules_update.sql 을 만들고 ② --apply 를 주면 Supabase 규칙표에 반영한다.
//   - 반영은 "[예시]"로 시작하는 값(관리자가 아직 고치지 않은 값)만 덮어쓴다. 관리자가 고친 줄은 건드리지 않는다.
//   - 새로 넣거나 바꾼 줄의 근거(reason)에는 "[AI 초안]"을 붙였다. 담당자가 검토해 고치고 표시를 지워 주세요.
// 판정 원칙 (국유재산법 기준, 시험 사례 정답과 따로 정함):
//   🟢 이용·개발을 제한할 뿐 매각을 막지 않는 지역지구 (일반재산은 처분할 수 있다: 국유재산법 제41조①)
//   🟡 소유권 이전은 가능하나 다른 법령의 협의·조건 확인이 필요 (하천법 제4조②, 개발제한구역법, 문화유산, 산지, 농지, 정비·도시계획시설 등)
//   🔴 국가가 직접 공공용·공용·보존용으로 쓰는 재산(행정재산)은 처분하지 못한다 (국유재산법 제6조②·제27조①)
import { readFileSync, writeFileSync } from "node:fs";

const Y = 2026;
const T = "[AI 초안 2026-11-12] ";
const row = (category, name, signal, why) => ({ category, name, signal, reason: T + why, base_year: Y });

const G_LIMIT = "이용·개발을 제한하는 구역이며 매각 자체를 막지 않아 판정에 영향이 없습니다. (국유재산법 제41조①)";
const green = (names, why = G_LIMIT) => names.map((n) => row("지역지구", n, "green", why));
const yellow = (names, why) => names.map((n) => row("지역지구", n, "yellow", why));

export const ROWS = [
  // ---- 기존 줄의 판정 변경 ----
  row("지역지구", "대공방어협조구역", "green", "건축 높이 등을 군과 협의하는 구역으로 매각 자체를 막지 않습니다. (매수 후 개발 때 협의)"),
  row("지역지구", "토지거래계약에관한허가구역", "green", "매수자가 토지거래허가를 받아야 하는 구역으로 매각 자체를 막지 않습니다. (매수 절차 안내)"),
  row("지역지구", "상대보호구역", "green", "학교 주변 교육환경 보호구역으로 일부 시설 설치를 제한할 뿐 매각을 막지 않습니다."),
  row("지역지구", "지구단위계획구역", "green", "지구단위계획에 따라 이용을 제한할 뿐 매각을 막지 않습니다."),
  row("지역지구", "하천구역", "yellow", "하천법 제4조②는 하천 구성 토지의 소유권 이전을 허용하지만 하천점용 등 협의가 필요해 담당자 상담이 필요합니다. (공공용 하천이면 지목으로 따로 매각 불가 판정)"),
  row("지역지구", "개발제한구역", "yellow", "개발제한구역은 행위가 제한될 뿐 매각이 금지되지는 않아 담당자 상담이 필요합니다."),
  row("지역지구", "도시자연공원구역", "yellow", "공원 시설 부지인지 확인이 필요해 담당자 상담이 필요합니다."),

  // ---- 새 줄: 지역지구 🟢 (이용·개발 제한형) ----
  ...green([
    "교육환경보호구역", "폐기물매립시설설치제한지역", "배출시설설치제한지역", "공장설립승인지역", "공장설립제한지역",
    "수질보전특별대책지역", "자연보전권역", "성장관리권역", "성장관리계획구역", "건축선", "자연경관지구", "미관지구", "고도지구",
    "시가지경관지구", "중점경관관리구역", "건축계획심의대상구역", "지하수자원보전2등급", "지하수자원보전3등급", "지하수자원보전4등급",
    "생태계보전지구4-2등급", "생태계보전지구5등급", "경관보전지구2등급", "경관보전지구3등급", "하수처리구역",
    "가로구역별최고높이제한지역", "서울도심", "동계올림픽특별구역", "자연재해위험개선지구", "제1종지구단위계획구역", "제2종지구단위계획구역",
    "역사문화환경보존지역", "준보전산지", "수변구역", "벤처기업육성촉진지구", "연구개발특구", "국가산업단지", "관광특구", "관광단지",
    "지하수자원보전1등급",
  ]),

  // ---- 새 줄: 지역지구 🟡 (협의·조건 확인 필요) ----
  ...yellow(["정비구역", "도시관리계획입안중", "도시기타용도지역지구미분류", "건축허가·착공제한지역"], "정비사업·도시계획 진행 여부에 따라 처분 방법이 제한될 수 있어 담당자 상담이 필요합니다."),
  ...yellow(["도로", "지하도로", "철도", "일반철도", "대로1류", "대로2류", "대로3류", "중로1류", "중로2류", "중로3류", "소로1류", "소로2류", "소로3류", "자동차정류장", "수도공급설비", "전기공급설비", "하수도", "학교", "공원"], "도시계획시설(공공시설) 부지에 해당할 수 있어 공공용 사용 여부 확인이 필요합니다."),
  ...yellow(["국가하천", "하천", "지방하천"], "하천 관련 구역으로 하천관리청 협의가 필요합니다. (하천법 제4조②)"),
  ...yellow(["공익용산지", "보전산지", "임업용산지"], "산지관리법상 보전 목적 산지로 이용 제한과 보존용재산 여부 확인이 필요합니다."),
  ...yellow(["야생생물보호구역", "생태·경관핵심보전구역", "비오톱1등급"], "자연환경 보전 목적 구역으로 담당자 상담이 필요합니다."),
  ...yellow(["국가지정문화유산구역", "등록문화유산구역", "역사문화환경보존육성지구"], "문화유산 보존 관련 협의가 필요해 담당자 상담이 필요합니다."),
  ...yellow(["농업진흥지역", "영농여건불리농지"], "농지법상 취득자격·용도 제한과 실경작자 우선 경쟁(국유재산법 시행령 제40조②2) 확인이 필요합니다."),
  ...yellow(["중요시설물보호지구", "원추표면구역"], "시설 보호·높이 제한 관련 협의가 필요할 수 있어 담당자 상담이 필요합니다."),

  // ---- 새 줄: 지역지구 🔴 ----
  row("지역지구", "공공청사", "red", "공공청사는 국가가 직접 사무용으로 쓰는 공용재산으로 처분할 수 없습니다. (국유재산법 제6조②1·제27조①)"),

  // ---- 새 줄: 지목 ----
  row("지목", "유지", "red", "저수지·연못 등 공공용으로 쓰이는 토지로 처분할 수 없습니다. (국유재산법 제6조②2·제27조①)"),
  row("지목", "수도용지", "red", "상수도 시설 등 공공용으로 쓰이는 토지로 처분할 수 없습니다. (국유재산법 제6조②2·제27조①)"),
  row("지목", "사적지", "yellow", "문화유산 보존 관련 확인이 필요해 담당자 상담이 필요합니다."),
  row("지목", "종교용지", "yellow", "종교 용도 점유 여부에 따라 처분 방법이 달라 담당자 상담이 필요합니다."),
  row("지목", "체육용지", "yellow", "공공 체육시설 여부 확인이 필요해 담당자 상담이 필요합니다."),
  row("지목", "유원지", "yellow", "공공 목적 여부 확인이 필요해 담당자 상담이 필요합니다."),
  row("지목", "광천지", "yellow", "특수 용도 토지로 담당자 상담이 필요합니다."),
  row("지목", "염전", "yellow", "특수 용도 토지로 담당자 상담이 필요합니다."),
  row("지목", "양어장", "yellow", "용도 제한 확인이 필요해 담당자 상담이 필요합니다."),
  row("지목", "주유소용지", "green", "상업 용도 대지로 일반적으로 매각 검토 대상입니다."),
];

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const sql =
  `-- 규칙표 보강 (2026-11-12) — supabase/rules-update-2026-11-12.mjs 가 만든 파일. 직접 고치지 말고 그 스크립트를 고친 뒤 다시 만든다.\n` +
  `-- "[예시]"로 시작하는 값만 덮어쓴다 (관리자가 고친 줄은 건드리지 않음). 새 줄은 그대로 넣는다.\n` +
  `insert into public.rules (category, name, signal, reason, base_year) values\n` +
  ROWS.map((r) => `(${q(r.category)}, ${q(r.name)}, ${q(r.signal)}, ${q(r.reason)}, ${r.base_year})`).join(",\n") +
  `\non conflict (category, name) do update\n  set signal = excluded.signal, reason = excluded.reason, base_year = excluded.base_year\n  where public.rules.reason like '[예시]%';\n`;
writeFileSync("supabase/migrations/003_rules_update.sql", sql);
console.log(`줄 ${ROWS.length}개 → supabase/migrations/003_rules_update.sql`);

if (process.argv.includes("--apply")) {
  const env = {};
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_]\w*)\s*=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };
  const base = `${env.SUPABASE_URL}/rest/v1/rules`;
  // 지금 DB 값: "[예시]"가 아닌(관리자가 고친) 줄은 건드리지 않는다. 이전에 이 스크립트가 넣은 "[AI 초안" 줄은 다시 덮어써도 된다.
  const nowRes = await fetch(`${base}?select=category,name,reason`, { headers: H });
  const now = await nowRes.json();
  const protectedKeys = new Set(now.filter((r) => !r.reason.startsWith("[예시]") && !r.reason.startsWith("[AI 초안")).map((r) => `${r.category}|${r.name}`));
  const todo = ROWS.filter((r) => !protectedKeys.has(`${r.category}|${r.name}`));
  const skipped = ROWS.length - todo.length;
  const res = await fetch(`${base}?on_conflict=category,name`, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(todo) });
  console.log(`DB 반영: HTTP ${res.status} · ${todo.length}줄 반영, 관리자가 고친 줄 ${skipped}개는 건너뜀`);
}
