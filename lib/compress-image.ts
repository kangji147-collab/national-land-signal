// Design Ref: §3.6, §4.2 — 현장 사진 1장을 받아 검사하고 브라우저에서 약 2MB로 줄인다. (PRD 보안: 10MB 이하, 약 2MB로 줄여 전송)
// 앞부분(검사·크기 계산)은 순수 규칙이라 화면 없이 시험할 수 있고, 마지막 compressImage 만 브라우저(캔버스)를 쓴다.
// 사진은 어디에도 저장하지 않는다. 이 파일은 브라우저 메모리 안에서만 다룬다.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 올릴 수 있는 원본 최대 10MB
export const TARGET_BYTES = 2 * 1024 * 1024; // 줄인 뒤 목표 약 2MB
export const MAX_SIDE_PX = 1600; // 긴 변 최대 길이
const QUALITIES = [0.8, 0.7, 0.6, 0.5, 0.4] as const;
const MAX_SHRINK_ROUNDS = 4; // 품질을 낮춰도 크면 크기를 줄여 다시 시도하는 최대 횟수

export type PhotoType = "jpeg" | "png";

/** 파일 앞부분(서명)으로 실제 형식을 알아낸다. 확장자·MIME 은 속일 수 있으므로 쓰지 않는다. */
export function detectImageType(head: Uint8Array): PhotoType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length >= 8 && PNG.every((b, i) => head[i] === b)) return "png";
  return null;
}

export type PhotoCheck = { ok: true; type: PhotoType } | { ok: false; message: string };

/** 올린 파일 검사: 비어 있지 않고, 10MB 이하이고, jpg·png 여야 한다. */
export function checkPhoto(size: number, head: Uint8Array): PhotoCheck {
  if (size <= 0) return { ok: false, message: "빈 파일이에요. 다른 사진을 골라 주세요" };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, message: "사진이 너무 커요. 10MB 이하의 사진을 골라 주세요" };
  const type = detectImageType(head);
  if (!type) return { ok: false, message: "jpg 또는 png 사진만 올릴 수 있어요" };
  return { ok: true, type };
}

/** 긴 변이 maxSide 를 넘지 않게 비율을 지켜 줄인 크기. 이미 작으면 그대로. */
export function fitSize(width: number, height: number, maxSide: number = MAX_SIDE_PX): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface CompressedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * 사진을 JPEG 로 줄인다: 긴 변 약 1600px, 품질 0.8 부터 시작해 2MB 를 넘으면 품질을 낮추고,
 * 그래도 크면 크기를 80%씩 줄여 다시 시도한다. 실패하면 오류를 던진다.
 * (브라우저에서만 동작. 휴대폰 사진의 회전 정보는 그대로 반영된다.)
 */
export async function compressImage(file: Blob): Promise<CompressedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    let { width, height } = fitSize(bitmap.width, bitmap.height);
    for (let round = 0; round <= MAX_SHRINK_ROUNDS; round++) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas 를 쓸 수 없어요");
      // PNG 의 투명한 부분이 검게 되지 않도록 흰 바탕을 깐다
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);

      for (const q of QUALITIES) {
        const blob = await toJpeg(canvas, q);
        if (!blob) throw new Error("사진을 줄이지 못했어요");
        if (blob.size <= TARGET_BYTES) return { blob, width, height };
      }
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }
    throw new Error("사진을 충분히 줄이지 못했어요");
  } finally {
    bitmap.close();
  }
}
