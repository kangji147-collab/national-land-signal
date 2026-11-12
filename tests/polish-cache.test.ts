// 문장 다듬기 결과 기억 시험 (lib/polish-cache.ts) — 같은 글이면 OpenAI 를 다시 부르지 않는다
import { describe, expect, it, vi } from "vitest";
import { withPolishCache } from "../lib/polish-cache";

const m = (user: string) => ({ system: "시스템", user });

describe("문장 다듬기 결과 기억", () => {
  it("같은 글을 여러 번 보내도 AI 는 한 번만 부른다", async () => {
    const polish = vi.fn(async () => "결과");
    const cached = withPolishCache(polish);
    for (let i = 0; i < 20; i++) expect(await cached(m("같은 글"))).toBe("결과");
    expect(polish).toHaveBeenCalledTimes(1);
  });

  it("글이 다르면(문장표가 바뀌면) 새로 다듬는다", async () => {
    const polish = vi.fn(async (x: { user: string }) => `다듬음:${x.user}`);
    const cached = withPolishCache(polish);
    expect(await cached(m("A"))).toBe("다듬음:A");
    expect(await cached(m("B"))).toBe("다듬음:B");
    expect(polish).toHaveBeenCalledTimes(2);
  });

  it("동시에 같은 글을 보내도 AI 는 한 번만 부른다", async () => {
    const polish = vi.fn(async () => "결과");
    const cached = withPolishCache(polish);
    await Promise.all(Array.from({ length: 10 }, () => cached(m("동시"))));
    expect(polish).toHaveBeenCalledTimes(1);
  });

  it("실패는 기억하지 않는다 (다음에 다시 시도)", async () => {
    const polish = vi.fn().mockRejectedValueOnce(new Error("AI 오류")).mockResolvedValue("결과");
    const cached = withPolishCache(polish);
    await expect(cached(m("글"))).rejects.toThrow();
    expect(await cached(m("글"))).toBe("결과");
    expect(polish).toHaveBeenCalledTimes(2);
  });

  it("기한이 지나면 새로 다듬는다", async () => {
    let t = 0;
    const polish = vi.fn(async () => "결과");
    const cached = withPolishCache(polish, { ttlMs: 1000, now: () => t });
    await cached(m("글"));
    t = 999;
    await cached(m("글"));
    expect(polish).toHaveBeenCalledTimes(1);
    t = 1001;
    await cached(m("글"));
    expect(polish).toHaveBeenCalledTimes(2);
  });

  it("기억하는 개수에 상한이 있다 (가장 오래된 것부터 비움)", async () => {
    const polish = vi.fn(async () => "결과");
    const cached = withPolishCache(polish, { max: 2 });
    await cached(m("1"));
    await cached(m("2"));
    await cached(m("3")); // 1 이 밀려남
    await cached(m("1")); // 다시 부른다
    expect(polish).toHaveBeenCalledTimes(4);
  });
});
