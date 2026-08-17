import PDFDocument from "pdfkit";

/**
 * La guida come PDF (reception): un servizio di IMPAGINAZIONE, non una
 * seconda generazione. Il testo è quello che il gosino ha già detto nel
 * thread — zero token, deterministico, niente da persistere: il contenuto
 * vive già in `customer_messages`, cifrato, e l'export/oblio lo conoscono
 * da lì. Prima riga = titolo, il resto = passi.
 *
 * Font standard (Helvetica, WinAnsi): copre l'italiano per intero ma non i
 * glifi tipografici che un modello ama infilare (frecce, virgolette curve,
 * em-dash). Si traslitterano invece di stamparne il tofu — un PDF per chi
 * «vuole il tempo sotto mano» non può avere caratteri rotti al passo 3.
 */

const REPLACEMENTS: [RegExp, string][] = [
  [/[‘’‚]/g, "'"],
  [/[“”„]/g, '"'],
  [/[–—]/g, "-"],
  [/…/g, "..."],
  [/[→➜➔]/g, "->"],
  [/←/g, "<-"],
  [/[•●▪]/g, "-"],
  [/\u00a0/g, " "],
];

export function toWinAnsi(text: string): string {
  let out = text;
  for (const [from, to] of REPLACEMENTS) out = out.replace(from, to);
  // quel che resta fuori da Latin-1 (emoji comprese) sparisce, senza tofu
  return out.replace(/[^\n -\u00ff]/g, "").replace(/[ \t]+$/gm, "");
}

export interface GuidePdfInput {
  /** il testo intero della risposta: prima riga titolo, poi i passi */
  text: string;
  /** etichetta di piè di pagina: il nome del cliente, mai un id */
  customerName: string;
  at?: Date;
}

/** Il PDF, per intero in memoria: una guida è pagine, non gigabyte. */
export function renderGuidePdf(input: GuidePdfInput): Promise<Buffer> {
  const at = input.at ?? new Date();
  const lines = toWinAnsi(input.text).split("\n");
  const title = (lines[0] ?? "Guida").trim() || "Guida";
  const body = lines.slice(1).join("\n").trim();

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 64, bottom: 64, left: 56, right: 56 },
    info: { Title: title, Author: "La reception di UGO" },
  });

  const done = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);
  });

  doc.font("Helvetica-Bold").fontSize(19).text(title);
  doc.moveDown(0.3);
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor("#666666")
    .text(
      `Preparata alla reception per ${toWinAnsi(input.customerName)} - ${at
        .toISOString()
        .slice(0, 10)}`,
    );
  doc.moveDown(0.2);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .lineWidth(0.7)
    .strokeColor("#bbbbbb")
    .stroke();
  doc.moveDown(0.8);
  doc.fillColor("#111111").fontSize(11.5);

  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line === "") {
      doc.moveDown(0.45);
      continue;
    }
    const step = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (step?.[1] !== undefined && step[2] !== undefined) {
      // un passo per riga, col numero in grassetto e il testo rientrato:
      // la struttura si vede anche stampata in bianco e nero
      doc.moveDown(0.35);
      doc.font("Helvetica-Bold").text(`${step[1]}. `, { continued: true });
      doc.font("Helvetica").text(step[2]);
    } else {
      doc.font("Helvetica").text(line);
    }
  }

  doc.end();
  return done;
}
