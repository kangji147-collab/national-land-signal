-- 규칙표에 '면적' 구분 추가 (2026-11-12) — 2024년도 국유재산 처분기준 제5조
-- 일단의 토지 면적이 특별시·광역시 2,000㎡ 초과, 그 밖의 시·시 외 지역 3,000㎡ 초과이면 매각 전에 총괄청(기획재정부) 승인이 필요하다.
-- 이름은 "지역구분:기준면적(㎡)" 모양이다. (metro = 특별시·광역시, other = 그 밖의 시·시 외 지역) 관리자는 기준 면적을 표 편집기에서 고칠 수 있다.
-- 판정은 필지 면적이 기준을 넘을 때 이 줄의 신호를 쓴다. 이어진 국유 토지 전체 면적은 알 수 없어서, 필지 하나가 이미 기준을 넘는 경우만 잡는다.
alter table public.rules drop constraint if exists rules_category_check;
alter table public.rules add constraint rules_category_check check (category in ('지목', '용도지역', '지역지구', '질문', '면적'));

insert into public.rules (category, name, signal, reason, base_year) values
('면적', 'metro:2000', 'yellow', '면적이 특별시·광역시 기준(2,000㎡)을 넘어 매각 전에 총괄청(기획재정부) 승인이 필요하므로 담당자 상담이 필요합니다. (2024년도 국유재산 처분기준 제5조)', 2026),
('면적', 'other:3000', 'yellow', '면적이 그 밖의 시·시 외 지역 기준(3,000㎡)을 넘어 매각 전에 총괄청(기획재정부) 승인이 필요하므로 담당자 상담이 필요합니다. (2024년도 국유재산 처분기준 제5조)', 2026)
on conflict (category, name) do nothing;
