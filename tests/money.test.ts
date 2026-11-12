import { describe, expect, it } from "vitest";
import { formatWon } from "../lib/money";

describe("formatWon", () => {
  it("억·만 단위로 읽기 쉽게 바꾼다", () => {
    expect(formatWon(413_000_000)).toBe("4억 1,300만 원");
    expect(formatWon(12_000_000)).toBe("1,200만 원");
    expect(formatWon(100_000_000)).toBe("1억 원");
    expect(formatWon(12_345_678_900)).toBe("123억 4,568만 원");
  });
  it("0·아주 작은 금액·이상한 값", () => {
    expect(formatWon(0)).toBe("0원");
    expect(formatWon(4_000)).toBe("1만 원 미만");
    expect(formatWon(-1)).toBe("-");
    expect(formatWon(Number.NaN)).toBe("-");
  });
});
