-- 배치 시뮬레이터용 시설물 표 (2026-11-12) — 민원인이 사진 위에 끌어다 놓는 "지도 범례" 항목
-- 웹(anon)은 읽기만 가능하다. 관리자는 Supabase 표 편집기에서 고친다. (값은 모두 [예시] — 실제 기준으로 교체 필요)
--  area_m2 : 아이콘 하나가 차지하는 면적(㎡). 놓은 시설물 면적 합이 필지 면적을 넘으면 제안서를 만들 수 없다.
--  units   : 아이콘 하나가 예상 수익 계산에 더해 주는 "수익 단위". 0이면 수익 계산에 들어가지 않는다.
--            공영주차장=주차면 수, 태양광=kW, 스마트팜=재배 면적(㎡). (단가표의 단위와 같다)
create table if not exists public.layout_items (
  id bigint generated always as identity primary key,
  theme text not null check (theme in ('공영주차장', '스마트팜', '태양광', '소공원')),
  name text not null,
  icon text not null,
  area_m2 numeric not null check (area_m2 > 0),
  units numeric not null default 0 check (units >= 0),
  unit_label text not null default '',
  sort_order int not null default 0,
  note text not null default '',
  unique (theme, name)
);
comment on table public.layout_items is '배치 시뮬레이터 시설물 표: 테마별로 끌어다 놓을 수 있는 시설물과 면적·수익 단위.';

alter table public.layout_items enable row level security;
drop policy if exists "read_layout_items" on public.layout_items;
create policy "read_layout_items" on public.layout_items for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.layout_items from anon, authenticated;

insert into public.layout_items (theme, name, icon, area_m2, units, unit_label, sort_order, note) values
('공영주차장', '주차 1면',          '🚗', 25,  1,   '면', 1, '[예시] 1면당 필요 면적 25㎡(단가표와 같은 값)'),
('공영주차장', '관리 부스',         '🏠', 9,   0,   '',   2, '[예시] 수익 계산에는 들어가지 않음'),
('공영주차장', '출입구·통로',       '🚧', 30,  0,   '',   3, '[예시] 수익 계산에는 들어가지 않음'),
('태양광',     '태양광 구획 (10kW)', '☀️', 125, 10,  'kW', 1, '[예시] 1kW당 12.5㎡ 기준(단가표 10~15㎡ 범위 안)'),
('태양광',     '인버터·관리함',     '⚡', 6,   0,   '',   2, '[예시] 수익 계산에는 들어가지 않음'),
('스마트팜',   '온실 1동 (100㎡)',  '🌱', 100, 100, '㎡', 1, '[예시] 재배 면적 100㎡'),
('스마트팜',   '작업·창고동',       '📦', 30,  0,   '',   2, '[예시] 수익 계산에는 들어가지 않음'),
('소공원',     '나무',              '🌳', 5,   0,   '',   1, '[예시]'),
('소공원',     '벤치',              '🪑', 2,   0,   '',   2, '[예시]'),
('소공원',     '화단',              '🌷', 10,  0,   '',   3, '[예시]'),
('소공원',     '산책로 구간',       '🚶', 20,  0,   '',   4, '[예시]'),
('소공원',     '놀이 시설',         '🎠', 60,  0,   '',   5, '[예시]')
on conflict (theme, name) do nothing;
