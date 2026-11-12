-- 국유지 신호등 — 주소 검색 하루 사용 횟수 종류 추가 (사용자 결정 2026-11-12)
-- 주소 검색(/api/address-search)을 접속 주소당 하루 100회로 제한하기 위해,
-- 사용 횟수 표(usage_counts)의 kind 에 'search' 를 허용한다.
-- 안전하게 여러 번 실행해도 되도록 먼저 지우고 다시 만든다. (표 안의 값은 건드리지 않는다)
-- reserve_usage / release_usage 함수는 kind 를 따로 검사하지 않으므로 그대로 쓴다.

alter table public.usage_counts drop constraint if exists usage_counts_kind_check;
alter table public.usage_counts
  add constraint usage_counts_kind_check
  check (kind in ('read', 'read_building', 'simulate', 'search'));
