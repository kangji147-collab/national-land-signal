// Design Ref: §6, §8 — 서버로 들어온 판정 요청이 "올바른 모양인지" 검사한다. (서버 전용: zod 를 브라우저로 보내지 않으려고 judge-request.ts 와 나눴다)
// 이 검사를 통과한 값만 판정에 쓴다. 판정·시뮬레이션·제안서 API 가 같은 검사를 쓴다.
import { z } from "zod";
import type { JudgeInput } from "./types";

const Answer = z.enum(["yes", "no", "unknown"]).nullable().optional();

export const JudgeRequestSchema = z.object({
  type: z.enum(["land", "building"]),
  landCategory: z.string().max(50),
  zone: z.string().max(50),
  otherZones: z.array(z.string().max(100)).max(200),
  // 알 수 없는 질문 키는 버린다(zod 기본). 값이 비면 "답 없음"으로 판정(🟡)된다.
  answers: z.object({ onbid: Answer, dispute: Answer, inUse: Answer, safety: Answer }),
  // 면적 규칙(처분기준 제5조)용. 없으면 면적 규칙을 적용하지 않는다
  area: z.number().finite().positive().max(1e9).optional(),
  region: z.enum(["metro", "other"]).optional(),
});

export type ParsedJudgeRequest = z.infer<typeof JudgeRequestSchema>;

/** 검사를 통과한 요청 → 판정 규칙(lib/judge.ts)이 받는 값 */
export function toJudgeInput(req: ParsedJudgeRequest): JudgeInput {
  return {
    type: req.type,
    landCategory: req.landCategory,
    zone: req.zone,
    otherZones: req.otherZones,
    answers: req.answers,
    area: req.area,
    region: req.region,
  };
}
