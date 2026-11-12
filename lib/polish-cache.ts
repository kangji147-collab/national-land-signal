// 기대효과 문장 다듬기 결과를 잠시 기억해 둔다. (보안 점검 SEC-001: /api/proposal 이 요청마다 OpenAI 를 부르던 문제)
// AI 에 보내는 글은 테마·대상·문장표 문장뿐이라, 같은 글이면 같은 결과를 다시 쓴다.
// → 몇 번을 눌러도 OpenAI 호출은 "서로 다른 글" 개수(테마 수 × 대상 수)를 넘지 않는다.
// 문장표를 관리자가 고치면 글이 달라져 자동으로 새로 다듬는다. 민원인 입력은 키에 들어가지 않는다.
import type { PolishMessages } from "./effects";

interface Entry {
  value: string;
  expiresAt: number;
}

export const POLISH_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6시간
export const POLISH_CACHE_MAX = 200;

/** AI 호출 함수를 감싸서 성공한 결과만 기억한다. (실패는 기억하지 않고 그대로 던진다) */
export function withPolishCache(
  polish: (messages: PolishMessages) => Promise<string>,
  options: { ttlMs?: number; max?: number; now?: () => number } = {},
): (messages: PolishMessages) => Promise<string> {
  const ttl = options.ttlMs ?? POLISH_CACHE_TTL_MS;
  const max = options.max ?? POLISH_CACHE_MAX;
  const now = options.now ?? Date.now;
  const store = new Map<string, Entry>();
  const pending = new Map<string, Promise<string>>(); // 같은 글을 동시에 보내도 AI 는 한 번만 부른다

  return async (messages) => {
    const key = `${messages.system}\u0000${messages.user}`;
    const hit = store.get(key);
    if (hit && hit.expiresAt > now()) return hit.value;

    let running = pending.get(key);
    if (!running) {
      running = polish(messages)
        .then((value) => {
          if (store.size >= max) store.delete(store.keys().next().value as string); // 가장 오래된 것부터 비운다
          store.set(key, { value, expiresAt: now() + ttl });
          return value;
        })
        .finally(() => pending.delete(key));
      pending.set(key, running);
    }
    return running;
  };
}
