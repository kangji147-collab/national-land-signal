-- 시설물 표에 "이미지 만들 때 AI에게 알려 줄 영어 설명" 열 추가 (2026-11-12)
-- 민원인이 사진 위에 직접 배치한 시설물을 시뮬레이션 이미지에도 같은 개수·위치로 그리게 하려는 것이다.
-- 비어 있으면 시설물 한글 이름을 그대로 알려 준다. 관리자는 표 편집기에서 새 시설물의 설명도 같이 적는다.
alter table public.layout_items add column if not exists description_en text not null default '';

update public.layout_items as t set description_en = v.d
from (values
  ('공영주차장', '주차 1면',          'one painted parking bay (a single car space) with a few generic parked cars'),
  ('공영주차장', '관리 부스',         'a small attendant booth'),
  ('공영주차장', '출입구·통로',       'a driveway entrance and access lane with a lift gate'),
  ('태양광',     '태양광 구획 (10kW)', 'one block of neat rows of photovoltaic panels on steel frames'),
  ('태양광',     '인버터·관리함',     'a small inverter cabin'),
  ('스마트팜',   '온실 1동 (100㎡)',  'one modern greenhouse building'),
  ('스마트팜',   '작업·창고동',       'a small work and storage building'),
  ('소공원',     '나무',              'a young tree'),
  ('소공원',     '벤치',              'a park bench'),
  ('소공원',     '화단',              'a flower bed'),
  ('소공원',     '산책로 구간',       'a section of paved walking path'),
  ('소공원',     '놀이 시설',         'a small playground structure')
) as v(theme, name, d)
where t.theme = v.theme and t.name = v.name and t.description_en = '';
