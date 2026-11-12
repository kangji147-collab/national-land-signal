"use client";
// Design Ref: §3.7 — 제안서 PDF 그리기 (브라우저에서 만든다. 서버로 보내거나 저장하지 않는다)
// 글은 lib/proposal-doc.ts 가 만들어 준 것을 그대로 그린다. 이 파일은 무겁기 때문에(PDF 도구 포함)
// 화면에서는 [PDF로 내려받기]를 누를 때만 import() 로 불러온다.
// 글꼴: Noto Sans KR 일반(Regular)에서 한글 11,172자·영문·기호만 뽑은 파일(public/fonts, 약 2.6MB, OFL 라이선스).
//   이모지(🟢 등)는 글꼴에 없어서 PDF에는 쓰지 않는다.
// react-pdf 의 Image 는 HTML <img> 가 아니라 PDF 그림 요소라서 alt 속성이 없다. (아래 캡션 글로 설명한다)
/* eslint-disable jsx-a11y/alt-text */
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { type DocBlock, type ProposalDoc, pdfFileName } from "@/lib/proposal-doc";

// 브라우저에서는 /fonts/ 주소로 받는다. (시험은 Node 에서 돌아서 파일 경로를 globalThis 로 바꿔 넣는다)
const FONT_SRC = (globalThis as { __PDF_FONT_SRC__?: string }).__PDF_FONT_SRC__ ?? "/fonts/NotoSansKR-Regular.subset.ttf";
Font.register({ family: "NotoSansKR", src: FONT_SRC });
// 단어 가운데서 끊지 않는다 (한글은 띄어쓰기 기준으로만 줄바꿈)
Font.registerHyphenationCallback((word) => [word]);

const NAVY = "#08205e";
const INK = "#18181b";
const MUTED = "#52525b";
const LINE = "#d4d4d8";

const s = StyleSheet.create({
  page: { fontFamily: "NotoSansKR", fontSize: 10, color: INK, paddingTop: 36, paddingBottom: 56, paddingHorizontal: 36, lineHeight: 1.5 },
  // 맨 위 짙은 남색 띠 (쪽 가장자리까지 채운다)
  band: { backgroundColor: NAVY, marginHorizontal: -36, marginTop: -36, paddingHorizontal: 36, paddingTop: 22, paddingBottom: 14, marginBottom: 12 },
  service: { fontSize: 9, color: "#c9d4f2" },
  // 큰 글씨는 줄 높이를 직접 정하고 아래 여백을 둔다 (Noto Sans KR 은 글자 위아래 여유가 커서 기본 줄 간격이면 다음 줄과 겹친다)
  title: { fontSize: 22, lineHeight: 1.6, marginTop: 2, marginBottom: 6, color: "#ffffff" },
  sub: { fontSize: 11, lineHeight: 1.6, color: "#e3e9fa", marginTop: 4 },
  rule: { borderBottomWidth: 1, borderBottomColor: LINE, marginVertical: 10 },
  siteRow: { flexDirection: "row", marginBottom: 1 },
  siteLabel: { width: 70, color: MUTED },
  siteValue: { flex: 1 },
  warn: { borderWidth: 1, borderColor: "#d97706", backgroundColor: "#fffbeb", padding: 6, marginTop: 8 },
  section: { marginTop: 12, padding: 10, borderWidth: 1, borderColor: LINE, borderTopWidth: 3, borderTopColor: NAVY },
  h2: { fontSize: 13, lineHeight: 1.6, marginBottom: 6, color: NAVY },
  headline: { fontSize: 16, lineHeight: 1.6, marginBottom: 6, color: NAVY },
  note: { fontSize: 9, color: MUTED },
  mark: { fontSize: 9, marginTop: 2 },
  images: { flexDirection: "row", gap: 8 },
  imageBox: { flex: 1 },
  img: { width: "100%", height: 150, objectFit: "contain" },
  caption: { fontSize: 8, color: MUTED, marginTop: 2 },
  bullet: { flexDirection: "row", marginBottom: 2 },
  dot: { width: 10 },
  // 쪽 아래에 고정하는 바닥글(fixed·absolute)은 이 도구에서 그려지지 않아서, 참고용 문구는 본문 맨 끝에 일반 글로 둔다
  disclaimer: { marginTop: 14, fontSize: 9, color: MUTED, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
});

function Block({ title, block }: { title: string; block: DocBlock }) {
  return (
    <View style={s.section} wrap={false}>
      <Text style={s.h2}>{title}</Text>
      <Text style={s.headline}>{block.headline}</Text>
      {block.lines.map((l, i) => (
        <Text key={i} style={s.note}>
          {l}
        </Text>
      ))}
      {block.mark && <Text style={s.mark}>{block.mark}</Text>}
      <Text style={[s.note, { marginTop: 3 }]}>{block.notice}</Text>
    </View>
  );
}

export function ProposalPdf({ doc, photoUrl, afterUrl, layoutUrl = null }: { doc: ProposalDoc; photoUrl: string | null; afterUrl: string | null; layoutUrl?: string | null }) {
  return (
    <Document title={`${doc.title} - ${doc.theme}`} author={doc.serviceName} language="ko">
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <Text style={s.service}>{doc.serviceName}</Text>
          <Text style={s.title}>{doc.title}</Text>
          <Text style={s.sub}>
            개발 테마: {doc.theme} · 작성일 {doc.dateText}
          </Text>
        </View>

        {doc.site.map((row) => (
          <View key={row.label} style={s.siteRow}>
            <Text style={s.siteLabel}>{row.label}</Text>
            <Text style={s.siteValue}>{row.value}</Text>
          </View>
        ))}
        {doc.edited.length > 0 && (
          <Text style={s.mark}>
            {doc.editedLabel}: {doc.edited.join(", ")}
          </Text>
        )}
        {doc.oldBuildingNote && (
          <View style={s.warn}>
            <Text>{doc.oldBuildingNote}</Text>
          </View>
        )}

        {doc.layout && (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>{doc.layout.heading}</Text>
            {doc.layout.imageIncluded && layoutUrl && <Image src={layoutUrl} style={s.img} />}
            {doc.layout.lines.map((l, i) => (
              <Text key={i} style={i === doc.layout!.lines.length - 1 ? s.caption : s.note}>
                {l}
              </Text>
            ))}
          </View>
        )}

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>① 시뮬레이션 이미지</Text>
          {doc.image.included && photoUrl && afterUrl ? (
            <>
              <View style={s.images}>
                <View style={s.imageBox}>
                  <Image src={photoUrl} style={s.img} />
                  <Text style={s.caption}>현재 사진</Text>
                </View>
                <View style={s.imageBox}>
                  <Image src={afterUrl} style={s.img} />
                  <Text style={s.caption}>개발 후</Text>
                </View>
              </View>
              <Text style={s.caption}>{doc.image.caption}</Text>
            </>
          ) : (
            <Text>{doc.image.included ? "" : doc.image.text}</Text>
          )}
        </View>

        <Block title="② 예상 수익 (연)" block={doc.income} />
        <Block title="③ 예상 매수 가격" block={doc.price} />

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>④ 기대효과</Text>
          {doc.effects.map((e, i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.dot}>•</Text>
              <Text style={{ flex: 1 }}>{e}</Text>
            </View>
          ))}
        </View>

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>{doc.purchaseGuide.heading}</Text>
          {doc.purchaseGuide.lines.map((l, i) => (
            <Text key={i} style={s.note}>
              {l}
            </Text>
          ))}
        </View>

        <Text style={s.disclaimer}>{doc.disclaimer}</Text>
      </Page>
    </Document>
  );
}

/** PDF를 만들어 브라우저 다운로드로 내려받게 한다. (서버로 보내지 않음) */
export async function downloadProposalPdf(doc: ProposalDoc, photoUrl: string | null, afterUrl: string | null, layoutUrl: string | null = null): Promise<void> {
  const blob = await pdf(<ProposalPdf doc={doc} photoUrl={photoUrl} afterUrl={afterUrl} layoutUrl={layoutUrl} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = pdfFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
