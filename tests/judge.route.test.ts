// /api/judge 시험: 규칙표 읽기만 가짜로 바꿔 끼우고, 실제 판정 규칙(lib/judge.ts)과 예시 규칙표(seed.sql)로 응답을 확인한다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuleRow } from "../lib/types";
import { loadSeedRules } from "./helpers/load-seed-rules";

vi.mock("@/lib/supabase", () => ({ createAnonClient: vi.fn(() => ({})) }));
vi.mock("@/lib/rules-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/rules-source")>()),
  fetchRules: vi.fn(),
  fetchContact: vi.fn(),
}));

import { POST } from "@/app/api/judge/route";
import { RulesSourceError, fetchContact, fetchRules } from "@/lib/rules-source";

const rules = vi.mocked(fetchRules);
const contact = vi.mocked(fetchContact);
const SEED = loadSeedRules();
const CONTACT = { name: "상담", phone: "1588-0000", hours: "평일 9시~18시" };

const OK = { onbid: "yes", dispute: "no", inUse: "no" } as const;
const req = (over: Record<string, unknown> = {}) => ({
  type: "land",
  landCategory: "대",
  zone: "제2종일반주거지역",
  otherZones: [],
  answers: OK,
  ...over,
});
const call = (body: unknown) =>
  POST(new Request("http://localhost/api/judge", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  rules.mockReset();
  contact.mockReset();
  rules.mockResolvedValue(SEED);
  contact.mockResolvedValue(CONTACT);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/judge — 판정", () => {
  it("🟢: 모두 통과하면 신호·근거·기준 연도를 돌려주고 연락처는 부르지 않는다", async () => {
    const res = await call(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { data } = await res.json();
    expect(data.signal).toBe("green");
    expect(data.reasons.length).toBeGreaterThanOrEqual(5); // 확인한 항목 전체
    expect(data.baseYears).toEqual([2026]);
    expect(data.contact).toBeNull();
    expect(contact).not.toHaveBeenCalled();
  });

  it("🔴: 매각 불가 조건이 있으면 🔴 이고 근거는 🔴 항목만, 연락처는 부르지 않는다", async () => {
    const { data } = await (await call(req({ landCategory: "도로", otherZones: ["상대보호구역(A유치원)<교육환경법>"] }))).json();
    expect(data.signal).toBe("red");
    expect(data.reasons.every((r: { signal: string }) => r.signal === "red")).toBe(true);
    expect(data.reasons[0]).toMatchObject({ kind: "지목", name: "도로" });
    expect(data.contact).toBeNull();
    expect(contact).not.toHaveBeenCalled();
  });

  it("🟡: 모르겠음이 있으면 🟡 이고 대표 연락처를 함께 돌려준다 (PRD 규칙 12)", async () => {
    const { data } = await (await call(req({ answers: { ...OK, dispute: "unknown" } }))).json();
    expect(data.signal).toBe("yellow");
    expect(data.contact).toEqual(CONTACT);
    expect(data.reasons.map((r: { name: string }) => r.name)).toEqual(["dispute:unknown"]);
  });

  it("규칙표에 없는 지역·지구는 🟡 (근거에 이름이 나온다)", async () => {
    const { data } = await (await call(req({ otherZones: ["없는구역<어떤법>"] }))).json();
    expect(data.signal).toBe("yellow");
    expect(data.reasons[0].reason).toContain("없는구역");
  });

  it("건물 진단은 안전진단 질문까지 본다 (빠지면 🟡)", async () => {
    expect((await (await call(req({ type: "building" }))).json()).data.signal).toBe("yellow");
    expect((await (await call(req({ type: "building", answers: { ...OK, safety: "no" } }))).json()).data.signal).toBe("green");
  });

  it("답이 null·빠짐이어도 판정한다 (🟡)", async () => {
    expect((await (await call(req({ answers: { onbid: "yes", dispute: null } }))).json()).data.signal).toBe("yellow");
    expect((await (await call(req({ answers: {} }))).json()).data.signal).toBe("yellow");
  });

  it("규칙표를 고치면 결과가 바뀐다 — 요청마다 규칙표를 새로 읽는다 (관리자가 고친 내용이 바로 반영)", async () => {
    expect((await (await call(req({ landCategory: "도로" }))).json()).data.signal).toBe("red");
    const edited: RuleRow[] = SEED.map((r) => (r.category === "지목" && r.name === "도로" ? { ...r, signal: "green" } : r));
    rules.mockResolvedValue(edited);
    expect((await (await call(req({ landCategory: "도로" }))).json()).data.signal).toBe("green");
    expect(rules).toHaveBeenCalledTimes(2);
  });

  it("기준 연도는 판정에 쓴 규칙표 줄들의 연도", async () => {
    rules.mockResolvedValue(SEED.map((r) => (r.category === "지목" && r.name === "대" ? { ...r, base_year: 2025 } : r)));
    expect((await (await call(req())).json()).data.baseYears).toEqual([2025, 2026]);
  });

  it("알 수 없는 질문 키·불필요한 값은 판정에 영향이 없다", async () => {
    const { data } = await (await call(req({ answers: { ...OK, hacker: "yes" }, extra: "x" }))).json();
    expect(data.signal).toBe("green");
  });
});

describe("POST /api/judge — 입력 검사", () => {
  it.each([
    ["JSON 이 아님", "not json"],
    ["본문이 비어 있음", ""],
    ["종류 없음", { ...req(), type: undefined }],
    ["종류가 이상함", req({ type: "house" })],
    ["지목이 글자가 아님", req({ landCategory: 5 })],
    ["지목이 너무 김", req({ landCategory: "가".repeat(51) })],
    ["용도지역이 너무 김", req({ zone: "가".repeat(51) })],
    ["지역지구가 목록이 아님", req({ otherZones: "도로" })],
    ["지역지구가 너무 많음", req({ otherZones: Array.from({ length: 201 }, (_, i) => `구역${i}`) })],
    ["지역지구 이름이 너무 김", req({ otherZones: ["가".repeat(101)] })],
    ["답이 이상한 값", req({ answers: { ...OK, onbid: "maybe" } })],
    ["답이 없음", { ...req(), answers: undefined }],
  ])("%s → 400 VALIDATION_ERROR, 규칙표를 읽지 않는다", async (_name, body) => {
    const res = await call(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(rules).not.toHaveBeenCalled();
  });

  it("지역지구 200개는 허용", async () => {
    const res = await call(req({ otherZones: Array.from({ length: 200 }, (_, i) => `구역${i}`) }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/judge — 오류", () => {
  it("규칙표를 읽지 못하면 500 SERVER_ERROR 이고, 빈 규칙으로 판정하지 않는다", async () => {
    rules.mockRejectedValue(new RulesSourceError("규칙표를 읽지 못했어요"));
    const res = await call(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("SERVER_ERROR");
  });

  it("🟡인데 연락처를 읽지 못해도 500 (연락처 없이 🟡만 보여주지 않는다)", async () => {
    contact.mockRejectedValue(new RulesSourceError("상담 연락처를 읽지 못했어요"));
    const res = await call(req({ answers: { ...OK, inUse: "unknown" } }));
    expect(res.status).toBe(500);
  });

  it("🟡이고 연락처 표가 비어 있으면 contact 는 null 로 돌려준다 (화면이 일반 안내로 대신함)", async () => {
    contact.mockResolvedValue(null);
    const { data } = await (await call(req({ answers: { ...OK, inUse: "unknown" } }))).json();
    expect(data.signal).toBe("yellow");
    expect(data.contact).toBeNull();
  });

  it("오류 응답과 로그에 DB 내용·입력한 값이 나오지 않는다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    rules.mockRejectedValue(new Error("secret-db-detail 비밀주소 123"));
    const res = await call(req({ otherZones: ["비밀스러운구역"] }));
    const body = await res.text();
    expect(body).not.toContain("secret-db-detail");
    expect(spy.mock.calls.flat().join(" ")).not.toMatch(/secret-db-detail|비밀스러운구역|비밀주소/);
  });
});
