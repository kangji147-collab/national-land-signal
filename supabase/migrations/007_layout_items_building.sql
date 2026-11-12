-- 배치 시뮬레이터를 건물 진단에도 쓰게 한다 (2026-11-12, 사용자 결정): 건물 테마 4개의 "건물 주변 외부 시설" 추가
--  - 건물은 수익을 연면적 × 임대료로 계산하므로 units = 0 (배치는 배치도·AI 이미지·PDF에만 반영되고 수익 계산에는 들어가지 않는다)
--  - 값은 모두 [예시] — 실제 기준으로 교체 필요
alter table public.layout_items drop constraint if exists layout_items_theme_check;
alter table public.layout_items add constraint layout_items_theme_check check (theme in (
  '공영주차장', '스마트팜', '태양광', '소공원',
  '공유오피스', '청년주택', '카페/문화공간', '창고(물류)'
));

insert into public.layout_items (theme, name, icon, area_m2, units, unit_label, sort_order, note, description_en) values
('공유오피스',     '방문자 주차 1면',   '🚗', 25, 0, '', 1, '[예시] 수익 계산에는 들어가지 않음', 'one painted visitor parking bay'),
('공유오피스',     '자전거 거치대',     '🚲', 6,  0, '', 2, '[예시]', 'a bicycle rack'),
('공유오피스',     '외부 휴게 테라스',  '🪑', 20, 0, '', 3, '[예시]', 'an outdoor rest terrace with a few tables and chairs'),
('공유오피스',     '조경수',            '🌳', 5,  0, '', 4, '[예시]', 'a young landscaping tree'),
('청년주택',       '입주자 주차 1면',   '🚗', 25, 0, '', 1, '[예시] 수익 계산에는 들어가지 않음', 'one painted resident parking bay'),
('청년주택',       '자전거 거치대',     '🚲', 6,  0, '', 2, '[예시]', 'a bicycle rack'),
('청년주택',       '분리수거장',        '♻️', 12, 0, '', 3, '[예시]', 'a small enclosed recycling collection area'),
('청년주택',       '마당 벤치',         '🪑', 2,  0, '', 4, '[예시]', 'a park bench'),
('청년주택',       '조경수',            '🌳', 5,  0, '', 5, '[예시]', 'a young landscaping tree'),
('카페/문화공간',  '야외 테라스',       '☕', 30, 0, '', 1, '[예시]', 'an outdoor cafe terrace with tables, chairs and parasols'),
('카페/문화공간',  '방문자 주차 1면',   '🚗', 25, 0, '', 2, '[예시] 수익 계산에는 들어가지 않음', 'one painted visitor parking bay'),
('카페/문화공간',  '자전거 거치대',     '🚲', 6,  0, '', 3, '[예시]', 'a bicycle rack'),
('카페/문화공간',  '조경수',            '🌳', 5,  0, '', 4, '[예시]', 'a young landscaping tree'),
('창고(물류)',     '상하차 구역',       '🚚', 60, 0, '', 1, '[예시]', 'a truck loading and unloading bay at the building'),
('창고(물류)',     '화물차 주차 1면',   '🚛', 40, 0, '', 2, '[예시]', 'one painted truck parking bay'),
('창고(물류)',     '야적 공간',         '📦', 50, 0, '', 3, '[예시]', 'a paved outdoor storage yard area'),
('창고(물류)',     '관리 사무 컨테이너', '🏠', 15, 0, '', 4, '[예시]', 'a small site office cabin')
on conflict (theme, name) do nothing;
