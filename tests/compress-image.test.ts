import { describe, expect, it } from "vitest";
import { MAX_SIDE_PX, MAX_UPLOAD_BYTES, checkPhoto, detectImageType, fitSize } from "../lib/compress-image";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

describe("detectImageType (파일 앞부분으로 형식 확인)", () => {
  it("jpeg·png 를 알아본다", () => {
    expect(detectImageType(JPEG)).toBe("jpeg");
    expect(detectImageType(PNG)).toBe("png");
  });
  it("gif·빈 값·짧은 값은 null", () => {
    expect(detectImageType(GIF)).toBeNull();
    expect(detectImageType(new Uint8Array([]))).toBeNull();
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
  });
});

describe("checkPhoto (올린 파일 검사)", () => {
  it("정상 jpg·png 는 통과", () => {
    expect(checkPhoto(1000, JPEG)).toEqual({ ok: true, type: "jpeg" });
    expect(checkPhoto(1000, PNG)).toEqual({ ok: true, type: "png" });
  });
  it("정확히 10MB 는 통과, 1바이트라도 넘으면 거절", () => {
    expect(checkPhoto(MAX_UPLOAD_BYTES, JPEG).ok).toBe(true);
    const r = checkPhoto(MAX_UPLOAD_BYTES + 1, JPEG);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("10MB");
  });
  it("빈 파일·다른 형식(이름만 jpg 인 gif 포함)은 거절", () => {
    expect(checkPhoto(0, JPEG).ok).toBe(false);
    const r = checkPhoto(500, GIF);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("jpg");
  });
});

describe("fitSize (긴 변 제한, 비율 유지)", () => {
  it("작은 사진은 그대로", () => {
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitSize(MAX_SIDE_PX, 100)).toEqual({ width: MAX_SIDE_PX, height: 100 });
  });
  it("가로·세로가 긴 사진을 비율대로 줄인다", () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });
  it("아주 가는 사진도 0이 되지 않는다", () => {
    expect(fitSize(100000, 10)).toEqual({ width: 1600, height: 1 });
  });
});
