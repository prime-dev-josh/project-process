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
