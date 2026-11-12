-- 국유지 신호등 — 표 만들기 (PLAN 작업 3번, DESIGN §5)
-- 관리 표 5개: 웹(서버)에서는 읽기만, 수정은 Supabase 표 편집기(관리자)에서만.
-- 사용 횟수 표 1개: 서버 비밀 키(service_role)로만 접근.
-- 안전하게 여러 번 실행해도 되도록 if not exists / create or replace 를 쓴다.

-- =========================================================
-- 1. 규칙표: 지목·용도지역·지역지구·보완 질문별 판정
-- =========================================================
create table if not exists public.rules (
  id bigint generated always as identity primary key,
  category text not null check (category in ('지목', '용도지역', '지역지구', '질문')),
  name text not null,                       -- 질문은 "질문키:답" (예: onbid:no)
  signal text not null check (signal in ('green', 'yellow', 'red')),
  reason text not null,                     -- 판정 근거 (민원인에게 보여줌)
  base_year int not null,                   -- 기준 연도
  unique (category, name)
);
comment on table public.rules is '규칙표: 판정은 이 표로만 한다. 관리자가 표 편집기에서 고친다.';

-- =========================================================
-- 2. 테마 허용표: 용도지역별로 고를 수 있는 테마
-- =========================================================
create table if not exists public.theme_permissions (
  id bigint generated always as identity primary key,
  target text not null check (target in ('land', 'building')),
  zone text not null,                       -- 용도지역 이름 (괄호·법령 이름 뗀 것)
  theme text not null check (theme in (
    '공영주차장', '스마트팜', '태양광', '소공원',
    '공유오피스', '청년주택', '카페/문화공간', '창고(물류)'
  )),
  unique (target, zone, theme)
);
comment on table public.theme_permissions is '테마 허용표: 토지 4개·건물 4개 테마 중 용도지역에 허용된 것만 보여준다.';

-- =========================================================
-- 3. 단가표: 테마별 최소·최대 단가 (예상 수익 계산용)
-- =========================================================
create table if not exists public.unit_prices (
  id bigint generated always as identity primary key,
  theme text not null,
  item text not null,                       -- 예: 월정기 요금, 1면당 필요 면적, 임대료 단가
  min_value numeric not null,
  max_value numeric not null,
  unit text not null,                       -- 예: 원/월/면, ㎡/면, 원/㎡/월
  source text not null,                     -- 출처
  base_year int not null,                   -- 기준 연도
  check (min_value <= max_value),
  unique (theme, item)
);
comment on table public.unit_prices is '단가표: 예상 수익은 AI가 지어내지 않고 이 표의 최소·최대 단가로 계산한다.';

-- =========================================================
-- 4. 기대효과 문장표: 테마별 기본 문장 (AI는 다듬기만)
-- =========================================================
create table if not exists public.effect_sentences (
  id bigint generated always as identity primary key,
  theme text not null,
  sentence text not null,
  sort_order int not null default 0
);
comment on table public.effect_sentences is '기대효과 문장표: 표에 없는 새 숫자는 만들지 않는다.';

-- =========================================================
-- 5. 상담 연락처: 🟡 안내에 쓰는 대표 연락처 1개
-- =========================================================
create table if not exists public.contacts (
  id bigint generated always as identity primary key,
  name text not null,
  phone text not null,
  hours text not null
);
-- 한 줄만 허용 (대표 연락처 1개)
create unique index if not exists contacts_single_row on public.contacts ((true));
comment on table public.contacts is '상담 연락처: 대표 연락처 1개만 둔다.';

-- =========================================================
-- 6. 사용 횟수: 접속 주소(해시)·종류·날짜별 횟수 (서버 전용)
-- =========================================================
create table if not exists public.usage_counts (
  ip_hash text not null,                    -- 접속 주소를 해시한 값 (원래 주소는 저장하지 않음)
  kind text not null check (kind in ('read', 'read_building', 'simulate')),
  day date not null,                        -- 한국 시간 기준 날짜
  count int not null default 0 check (count >= 0),
  primary key (ip_hash, kind, day)
);
comment on table public.usage_counts is '하루 사용 횟수: 서류 판독 20회, 시뮬레이션 5회. 서버 비밀 키로만 접근.';

-- =========================================================
-- RLS (행 단위 접근 규칙)
-- =========================================================
alter table public.rules enable row level security;
alter table public.theme_permissions enable row level security;
alter table public.unit_prices enable row level security;
alter table public.effect_sentences enable row level security;
alter table public.contacts enable row level security;
alter table public.usage_counts enable row level security;

-- 관리 표 5개: 누구나(웹) 읽기만 가능
drop policy if exists "read_rules" on public.rules;
create policy "read_rules" on public.rules for select to anon, authenticated using (true);
drop policy if exists "read_theme_permissions" on public.theme_permissions;
create policy "read_theme_permissions" on public.theme_permissions for select to anon, authenticated using (true);
drop policy if exists "read_unit_prices" on public.unit_prices;
create policy "read_unit_prices" on public.unit_prices for select to anon, authenticated using (true);
drop policy if exists "read_effect_sentences" on public.effect_sentences;
create policy "read_effect_sentences" on public.effect_sentences for select to anon, authenticated using (true);
drop policy if exists "read_contacts" on public.contacts;
create policy "read_contacts" on public.contacts for select to anon, authenticated using (true);
-- usage_counts: 정책을 만들지 않는다 → 웹(anon)은 읽기·쓰기 모두 불가, 서버 비밀 키(service_role)만 가능

-- 이중 안전장치: 권한 자체에서도 쓰기·접근을 막는다
revoke insert, update, delete, truncate on
  public.rules, public.theme_permissions, public.unit_prices,
  public.effect_sentences, public.contacts
  from anon, authenticated;
revoke all on public.usage_counts from anon, authenticated;

-- =========================================================
-- 횟수 함수: 동시에 눌러도 한도를 넘지 않게 DB 안에서 한 번에 처리
-- =========================================================
-- 먼저 1회 잡기: 남은 횟수가 있을 때만 +1 하고 true, 한도에 도달했으면 false
create or replace function public.reserve_usage(p_ip_hash text, p_kind text, p_limit int)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;  -- 한국 시간 0시 기준
  v_rows int;
begin
  if p_limit < 1 then
    return false;
  end if;

  insert into public.usage_counts as u (ip_hash, kind, day, count)
  values (p_ip_hash, p_kind, v_day, 1)
  on conflict (ip_hash, kind, day)
  do update set count = u.count + 1
  where u.count < p_limit;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- AI 호출이 실패했을 때 잡아 둔 1회를 돌려주기 (0 아래로는 내려가지 않음)
create or replace function public.release_usage(p_ip_hash text, p_kind text)
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.usage_counts
     set count = greatest(count - 1, 0)
   where ip_hash = p_ip_hash
     and kind = p_kind
     and day = (now() at time zone 'Asia/Seoul')::date;
end;
$$;

-- 이 함수들은 웹(익명·로그인 사용자)이 실행하지 못하게 하고, 서버 비밀 키 역할만 실행 가능
revoke execute on function public.reserve_usage(text, text, int) from public, anon, authenticated;
revoke execute on function public.release_usage(text, text) from public, anon, authenticated;
grant execute on function public.reserve_usage(text, text, int) to service_role;
grant execute on function public.release_usage(text, text) to service_role;
