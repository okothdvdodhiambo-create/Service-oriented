export interface Candidate {
  documentType: string;
  documentNumber: string;
}

export function parseCandidates(text: string): Candidate[] {
  if (new TextEncoder().encode(text).length > 1_000_000) throw new Error("CSV file must be smaller than 1 MB.");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i]!;
    if (quoted) {
      if (character === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field.trim());
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) throw new Error("Add at least one candidate.");

  const first = rows[0]!.map((cell) => cell.toLowerCase());
  const hasHeader = first.includes("documenttype") && first.includes("documentnumber");
  if (!hasHeader && first.some((cell) => cell === "documenttype" || cell === "documentnumber")) {
    throw new Error("CSV header must include both documentType and documentNumber.");
  }
  const typeIndex = hasHeader ? first.indexOf("documenttype") : 0;
  const numberIndex = hasHeader ? first.indexOf("documentnumber") : 1;
  const data = rows.slice(hasHeader ? 1 : 0).map((cells) => ({
    documentType: cells[typeIndex] ?? "",
    documentNumber: cells[numberIndex] ?? ""
  }));
  if (data.length > 500) throw new Error("A batch may contain no more than 500 candidates.");
  if (data.some((item) => !/^[A-Z0-9_-]{1,64}$/i.test(item.documentType) ||
      item.documentNumber.length < 1 || item.documentNumber.length > 128)) {
    throw new Error("Each row needs a valid document type and a number of at most 128 characters.");
  }
  return data;
}

export function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
