// Design Ref: §6, §8 — /api/proposal 으로 들어온 요청이 "올바른 모양인지" 검사한다. (서버 전용)
import { z } from "zod";
import { JudgeRequestSchema } from "./judge-schema";

const EDITED = [
  "address", "landCategory", "area", "officialPrice", "zone", "zones",
  "mainPurpose", "totalFloorArea", "floors", "structure", "approvalDate",
] as const;

const MAX_AMOUNT = 1e15; // 1,000조 원 — 터무니없는 큰 수를 거른다

export const ProposalRequestSchema = JudgeRequestSchema.extend({
  theme: z.string().min(1).max(30),
  area: z.number().finite().positive().max(1e9),
  officialPrice: z.number().finite().min(0).max(MAX_AMOUNT).nullable(),
  totalFloorArea: z.number().finite().positive().max(1e9).nullable(),
  // 시가표준액은 0 이상의 정수(원 단위)
  buildingStandardValue: z.number().int().min(0).max(MAX_AMOUNT).nullable(),
  approvalDate: z.string().max(20),
  edited: z.array(z.enum(EDITED)).max(20),
});

export type ParsedProposalRequest = z.infer<typeof ProposalRequestSchema>;

/** /api/simulate 의 meta(JSON 글자) 모양: 판정에 쓰는 값 + 테마 (사진은 따로 파일로 온다) */
export const SimulateMetaSchema = JudgeRequestSchema.extend({
  theme: z.string().min(1).max(30),
});
