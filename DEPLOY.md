# 배포 준비 점검 (PLAN 작업 23번)

점검일: 2026-11-12 · 결과: **빌드·검사 통과. Vercel 운영 배포 완료** (https://national-land-signal.vercel.app, GitHub: https://github.com/kangji147-collab/national-land-signal). 배포 서버는 서울(`vercel.json`의 `icn1`)에서 실행한다.

## 점검 결과

| 항목 | 결과 |
|---|---|
| `npm run build` | 통과 (Next.js 16.4.6, 경로 12개: 화면 2 + API 7 + 기본 3) |
| `npm run lint` · 타입 검사 | 오류 없음 |
| 자동 시험 | 392개 통과 (사용자 사례 정답이 들어오면 판정 정확도 시험이 추가됨) |
| 배포용 실행(`npm start`) 시험 | `/diagnose` 200, `/api/usage` 200(`no-store`), `/api/simulate` 빈 요청 400, 글꼴 파일 2.6MB 정상 서빙 |
| 비밀 값 노출 | 코드·`.env.example`에 `NEXT_PUBLIC_` 값 없음. `.env`·`trash-can`·`.next`는 `.gitignore`에 등록됨 |
| 빌드 중 `/api/usage 처리 중 오류` 로그 2줄 | 빌드가 미리 그려 보려다 요청 정보가 없어서 난 것이며 경로는 동적(ƒ)으로 정상 표시됨. 배포 실행에서는 200 |

## Vercel에 넣을 환경 변수 (앱 코드가 쓰는 것, 모두 서버 전용)

| 이름 | 필수 | 용도 | 로컬 `.env` |
|---|:-:|---|:-:|
| `SUPABASE_URL` | 예 | 규칙표·사용 횟수 | 있음 |
| `SUPABASE_ANON_KEY` | 예 | 규칙표 읽기(웹은 읽기만) | 있음 |
| `SUPABASE_SERVICE_ROLE_KEY` | 예 | 사용 횟수 기록 | 있음 |
| `OPENAI_API_KEY` | 예 | 기대효과 문장·시뮬레이션 이미지 | 있음 |
| `OPENAI_TEXT_MODEL` | 아니오 | 비우면 `gpt-4o-mini` | (비움) |
| `OPENAI_IMAGE_MODEL` | 아니오 | 비우면 `gpt-image-2` | (비움) |
| `VWORLD_API_KEY` | 예 | 주소 검색·토지 정보 | 있음 |
| `VWORLD_DOMAIN` | 예 | 브이월드에 등록한 서비스 주소 (**배포 주소로 바꿔야 함**) | 있음(localhost) |
| `DATA_GO_KR_API_KEY` | 예 | 건축물대장 | 있음 |
| `IP_HASH_SALT` | 예 | 접속 주소 해시용 임의의 긴 문자열(16자 이상) | 있음 |

CLI 작업용(`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `VERCEL_TOKEN`, `GITHUB_TOKEN`)은 내 컴퓨터에서만 쓰고 Vercel 환경 변수에는 넣지 않는다.

## 배포 전에 사람이 해야 하는 일

1. ✅ **브이월드에 배포 주소 등록 — 완료 (2026-11-12).** `national-land-signal.vercel.app`을 등록했고 `VWORLD_DOMAIN`도 이 주소로 설정돼 있다. 배포본에서 주소 검색·토지 조회·건물 조회(건축HUB)·판정이 정상인 것을 확인했다. (등록 전에는 토지 정보 API가 `INCORRECT_KEY`로 거절됐다. 배포 주소가 바뀌면 다시 등록해야 한다.)
2. **접속 주소 헤더 확인** — `lib/usage-limit.ts`의 `getClientIp`는 `x-vercel-forwarded-for` → `x-real-ip` → `x-forwarded-for` 순으로 읽는다. Vercel 문서로 이 순서가 맞는지(그리고 사용자가 보낸 값이 덮어써지는지) 확인하고, 배포 후 두 기기에서 횟수가 따로 세어지는지 시험한다. 헤더를 못 읽으면 모두 `unknown` 한 칸으로 합쳐져 하루 한도를 함께 쓰게 된다.
3. **함수 실행 시간 한도 확인** — `/api/simulate`는 `maxDuration = 120`(초)이다. 이미지는 보통 약 30초지만, 사용 중인 Vercel 요금제에서 120초가 허용되는지 확인한다. 허용되지 않으면 값을 낮추고 `lib/openai.ts`의 `IMAGE_TIMEOUT_MS`(100초)도 같이 줄인다.
4. **임시 값 교체** — 상담 연락처(1588-3570으로 교체 완료, 운영 시간은 미확인), 단가표·기대효과 문장의 `[예시]` 값, 매수 신청 안내 문구(`lib/messages.ts`, 임시 작성).
5. **OpenAI 비용 확인** — 문장(`gpt-4o-mini`)·이미지(`gpt-image-2`) 1회당 비용을 가격표로 확인하고 사용 한도(하루 5회/접속 주소)가 적당한지 본다.
6. **판정 정확도 확인** — 시험 사례 20건 정답을 넣고 `tests/cases/RESULTS.md` 절차로 일치율·위험한 오판정을 확인한다. (작업 22번 진행 중)

## 배포 순서 (CLAUDE.md 4-5 방식: `.env`의 `VERCEL_TOKEN` 사용)

1. 위 1~3번 확인
2. Vercel에 환경 변수 입력(값은 화면·채팅에 출력하지 않음)
3. `npx vercel deploy --token "$VERCEL_TOKEN"` (미리보기) → 실제 주소로 진단~제안서 PDF까지 한 번 시험
4. 문제가 없으면 운영 배포
