// 금액을 읽기 쉬운 글자로 바꾼다. (순수 규칙) 예) 413000000 → "4억 1,300만 원"
// 만 원 미만은 반올림해서 보여주고, 1만 원 미만의 0이 아닌 금액은 "1만 원 미만"으로 적는다.
export function formatWon(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "-";
  if (n === 0) return "0원";
  const man = Math.round(n / 10_000); // 만 원 단위
  if (man === 0) return "1만 원 미만";
  const eok = Math.floor(man / 10_000);
  const rest = man % 10_000;
  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (rest > 0) parts.push(`${rest.toLocaleString("ko-KR")}만`);
  return `${parts.join(" ")} 원`;
}
