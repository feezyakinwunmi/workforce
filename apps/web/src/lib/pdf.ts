import { deflateSync } from "node:zlib";

/**
 * A tiny PDF writer for simple documents (payslips): text in Helvetica / Helvetica-Bold,
 * lines and filled rectangles on A4 pages. No dependencies, server only.
 * Coordinates are in points from the TOP-left corner (A4 = 595 × 842).
 * The built-in PDF fonts only cover Western European letters, so text is converted
 * (accents kept where possible, other marks dropped); write money as "NGN 1,000.00", not "₦".
 */

export const A4 = { width: 595.28, height: 841.89 };

// Character widths (1/1000 em) for codes 32–126.
// prettier-ignore
const HELVETICA = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
// prettier-ignore
const HELVETICA_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

// WinAnsi codes for common punctuation outside Latin-1, with their widths (regular, bold).
const SPECIAL: Record<string, [number, number, number]> = {
  "–": [0x96, 556, 556],
  "—": [0x97, 1000, 1000],
  "‘": [0x91, 222, 278],
  "’": [0x92, 222, 278],
  "“": [0x93, 333, 500],
  "”": [0x94, 333, 500],
  "•": [0x95, 350, 350],
  "…": [0x85, 1000, 1000],
  "€": [0x80, 556, 556],
  "·": [0xb7, 278, 278],
  "×": [0xd7, 584, 584],
};

type Glyph = { code: number; w: number };

function glyphs(text: string, bold: boolean): Glyph[] {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  const out: Glyph[] = [];
  for (const ch of text.replace(/₦/g, "NGN ")) {
    const c = ch.codePointAt(0)!;
    if (c >= 32 && c <= 126) {
      out.push({ code: c, w: table[c - 32] });
      continue;
    }
    const sp = SPECIAL[ch];
    if (sp) {
      out.push({ code: sp[0], w: bold ? sp[2] : sp[1] });
      continue;
    }
    // Latin-1 letters keep their code; width from the plain letter.
    const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const bc = base.codePointAt(0) ?? 63;
    const w = bc >= 32 && bc <= 126 ? table[bc - 32] : 556;
    if (c >= 0xa0 && c <= 0xff) out.push({ code: c, w });
    else for (const b of base) {
      const bcode = b.codePointAt(0)!;
      out.push(bcode >= 32 && bcode <= 126 ? { code: bcode, w: table[bcode - 32] } : { code: 63, w: table[63 - 32] });
    }
  }
  return out;
}

function pdfString(gs: Glyph[]) {
  let s = "(";
  for (const g of gs) {
    if (g.code === 40 || g.code === 41 || g.code === 92) s += "\\" + String.fromCharCode(g.code);
    else if (g.code < 32 || g.code > 126) s += "\\" + g.code.toString(8).padStart(3, "0");
    else s += String.fromCharCode(g.code);
  }
  return s + ")";
}

type Rgb = [number, number, number];
export const hex = (h: string): Rgb => {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const f = (n: number) => (Math.round(n * 100) / 100).toString();
const rgb = (c: Rgb) => c.map((v) => f(v)).join(" ");

export type TextOptions = { size?: number; bold?: boolean; color?: string; align?: "left" | "right" | "center"; maxWidth?: number };

export class PdfDoc {
  private pages: string[][] = [];
  private current: string[] = [];

  constructor(public readonly width = A4.width, public readonly height = A4.height) {
    this.addPage();
  }

  addPage() {
    this.current = [];
    this.pages.push(this.current);
  }

  /** Width of a piece of text in points. */
  measure(text: string, size = 10, bold = false) {
    return (glyphs(text, bold).reduce((s, g) => s + g.w, 0) * size) / 1000;
  }

  /** Shorten text with "…" so it fits in maxWidth. */
  fit(text: string, maxWidth: number, size = 10, bold = false) {
    if (this.measure(text, size, bold) <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && this.measure(t + "…", size, bold) > maxWidth) t = t.slice(0, -1);
    return t.trimEnd() + "…";
  }

  /** y is the text baseline, measured from the top of the page. */
  text(x: number, y: number, text: string, o: TextOptions = {}) {
    const size = o.size ?? 10;
    const bold = o.bold ?? false;
    const t = o.maxWidth ? this.fit(text, o.maxWidth, size, bold) : text;
    const w = this.measure(t, size, bold);
    const left = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    this.current.push(
      `BT ${rgb(hex(o.color ?? "#15123a"))} rg /${bold ? "F2" : "F1"} ${f(size)} Tf ${f(left)} ${f(this.height - y)} Td ${pdfString(glyphs(t, bold))} Tj ET`,
    );
  }

  rect(x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; lineWidth?: number; radius?: number } = {}) {
    const ops: string[] = ["q"];
    if (o.fill) ops.push(`${rgb(hex(o.fill))} rg`);
    if (o.stroke) ops.push(`${rgb(hex(o.stroke))} RG ${f(o.lineWidth ?? 0.75)} w`);
    const r = Math.min(o.radius ?? 0, w / 2, h / 2);
    const top = this.height - y;
    const bottom = top - h;
    if (r > 0) {
      const k = r * 0.5523;
      ops.push(
        `${f(x + r)} ${f(bottom)} m ${f(x + w - r)} ${f(bottom)} l`,
        `${f(x + w - r + k)} ${f(bottom)} ${f(x + w)} ${f(bottom + r - k)} ${f(x + w)} ${f(bottom + r)} c`,
        `${f(x + w)} ${f(top - r)} l ${f(x + w)} ${f(top - r + k)} ${f(x + w - r + k)} ${f(top)} ${f(x + w - r)} ${f(top)} c`,
        `${f(x + r)} ${f(top)} l ${f(x + r - k)} ${f(top)} ${f(x)} ${f(top - r + k)} ${f(x)} ${f(top - r)} c`,
        `${f(x)} ${f(bottom + r)} l ${f(x)} ${f(bottom + r - k)} ${f(x + r - k)} ${f(bottom)} ${f(x + r)} ${f(bottom)} c h`,
      );
    } else {
      ops.push(`${f(x)} ${f(bottom)} ${f(w)} ${f(h)} re`);
    }
    ops.push(o.fill && o.stroke ? "B" : o.fill ? "f" : "S", "Q");
    this.current.push(ops.join(" "));
  }

  line(x1: number, y1: number, x2: number, y2: number, o: { color?: string; width?: number } = {}) {
    this.current.push(
      `q ${rgb(hex(o.color ?? "#e3e0ee"))} RG ${f(o.width ?? 0.75)} w ${f(x1)} ${f(this.height - y1)} m ${f(x2)} ${f(this.height - y2)} l S Q`,
    );
  }

  /** Any raw drawing in PDF user space (y up), e.g. a logo path. */
  raw(ops: string) {
    this.current.push(ops);
  }

  toBuffer(meta: { title?: string; author?: string } = {}): Buffer {
    const objects: Buffer[] = [];
    const add = (body: string | Buffer) => {
      objects.push(typeof body === "string" ? Buffer.from(body, "latin1") : body);
      return objects.length;
    };
    const info = (s: string) => pdfString(glyphs(s, false));

    const catalog = add(""); // filled below
    const pagesId = add("");
    const fontRegular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const pageIds: number[] = [];
    for (const ops of this.pages) {
      const content = deflateSync(Buffer.from(ops.join("\n"), "latin1"));
      const stream = Buffer.concat([
        Buffer.from(`<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n`, "latin1"),
        content,
        Buffer.from("\nendstream", "latin1"),
      ]);
      const contentId = add(stream);
      pageIds.push(
        add(
          `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f(this.width)} ${f(this.height)}] ` +
            `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`,
        ),
      );
    }
    objects[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, "latin1");
    objects[pagesId - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`, "latin1");
    const infoId = add(
      `<< /Producer (Workbase) ${meta.title ? `/Title ${info(meta.title)} ` : ""}${meta.author ? `/Author ${info(meta.author)} ` : ""}>>`,
    );

    const parts: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    const offsets: number[] = [];
    let pos = parts[0].length;
    objects.forEach((body, i) => {
      offsets.push(pos);
      const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), body, Buffer.from("\nendobj\n", "latin1")]);
      parts.push(chunk);
      pos += chunk.length;
    });
    const xref =
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
      offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
      `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${infoId} 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
    parts.push(Buffer.from(xref, "latin1"));
    return Buffer.concat(parts);
  }
}
