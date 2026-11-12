// 제안서 PDF 만들기 시험 (app/diagnose/_components/ProposalPdf.tsx) — 실제로 PDF 파일이 만들어지는지(한글 글꼴 포함) 확인한다.
// 환경 변수 PDF_OUT 에 파일 경로를 주면 만들어진 PDF를 그 경로에 저장한다. (눈으로 확인할 때만)
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { beforeAll, describe, expect, it } from "vitest";
import { calcIncome, calcPurchasePrice } from "../lib/calc";
import { buildProposalDoc } from "../lib/proposal-doc";
import type { ReviewedValues } from "../lib/review";
import { loadSeedPrices } from "./helpers/load-seed-prices";

/** 단색 PNG (시험용 그림) 을 데이터 주소로 */
function pngDataUrl(w: number, h: number, rgb: [number, number, number]): string {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  const crcT = [...Array(256)].map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = ~0;
    for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8);
    return ~c >>> 0;
  };
  const chunk = (t: string, d: Buffer) => {
    const l = Buffer.alloc(4);
    l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

const REVIEWED: ReviewedValues = {
  mode: "land",
  pnu: "1",
  address: "서울특별시 중구 태평로1가 31",
  landCategory: "대",
  area: 500,
  officialPrice: 1_000_000,
  officialPriceYear: 2026,
  zone: "계획관리지역",
  zones: [],
  referenceZones: [],
  building: null,
  edited: ["area"],
};
const input = { type: "land" as const, theme: "공영주차장", landArea: 500, officialPrice: 1_000_000, edited: { landArea: true } };
const doc = (imageIncluded: boolean) =>
  buildProposalDoc({
    reviewed: REVIEWED,
    proposal: {
      theme: "공영주차장",
      income: calcIncome(input, loadSeedPrices()),
      price: calcPurchasePrice(input),
      effects: { sentences: ["방치된 땅이 주차 공간으로 바뀌어 주민의 주차 불편이 줄어듭니다.", "꾸준한 주차 수요를 바탕으로 안정적인 운영 수입을 기대할 수 있습니다.", "관리되지 않던 공터가 정비되어 주변 환경이 깨끗해집니다. 뷁 쫓 샘 얘"], source: "table" },
      oldBuilding: null,
    },
    imageIncluded,
    now: new Date("2026-11-12T01:00:00Z"),
  });

// 브라우저에서는 /fonts/... 주소로 받지만, 시험(Node)에서는 파일 경로로 바꿔 등록한다 (ProposalPdf 를 불러오기 전에 지정)
let ProposalPdf: typeof import("../app/diagnose/_components/ProposalPdf").ProposalPdf;
beforeAll(async () => {
  (globalThis as { __PDF_FONT_SRC__?: string }).__PDF_FONT_SRC__ = resolve(__dirname, "..", "public", "fonts", "NotoSansKR-Regular.subset.ttf");
  ProposalPdf = (await import("../app/diagnose/_components/ProposalPdf")).ProposalPdf;
});

describe("ProposalPdf", () => {
  it("이미지가 있을 때 PDF 가 만들어진다 (한글 글꼴 포함)", async () => {
    const buf = await renderToBuffer(<ProposalPdf doc={doc(true)} photoUrl={pngDataUrl(80, 60, [140, 170, 110])} afterUrl={pngDataUrl(80, 60, [90, 150, 200])} />);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(20_000);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, buf);
  }, 60_000);

  it("이미지가 없어도(제외됨) PDF 가 만들어진다", async () => {
    const buf = await renderToBuffer(<ProposalPdf doc={doc(false)} photoUrl={null} afterUrl={null} />);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT.replace(/\.pdf$/, "-noimg.pdf"), buf);
  }, 60_000);
});
