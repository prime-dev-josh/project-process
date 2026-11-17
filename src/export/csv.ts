function csvCell(value: string | number | boolean | null | undefined) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvRow(cells: Array<string | number | boolean | null | undefined>) {
  return cells.map(csvCell).join(",");
}

export function csvTable(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  return [csvRow(headers), ...rows.map(csvRow)].join("\r\n");
}

export function downloadTextFile(contents: string, filename: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** RFC 4180 rows. A trailing newline does not create an extra empty record. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
        continue;
      }
      cell += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
  }
  if (quoted || cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export type CsvTable = Record<string, string>[];

export function csvSections(text: string): Record<string, CsvTable> {
  const sections: Record<string, CsvTable> = {};
  let name = "";
  let headers: string[] | null = null;
  const rows = parseCsv(text);
  for (const row of rows) {
    const first = (row[0] ?? "").trim();
    if (row.every((cell) => !String(cell).trim())) continue;
    if (first.startsWith("#")) {
      name = first.replace(/^#\s*/, "").trim().toLowerCase();
      headers = null;
      continue;
    }
    if (!name) continue;
    if (!headers) {
      headers = row.map((cell) => cell.trim().toLowerCase());
      sections[name] = [];
      continue;
    }
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = row[index] ?? "";
    });
    sections[name].push(record);
  }
  return sections;
}

export function looksLikeGraphCsv(text: string) {
  const head = text.replace(/^\uFEFF/, "").trimStart().slice(0, 400).toLowerCase();
  return head.startsWith("# nodes") || head.startsWith("# groups") || head.startsWith("# links");
}
