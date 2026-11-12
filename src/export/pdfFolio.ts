export type PageRange = { start: number; end: number };
export type PageIndex = Map<string, PageRange>;

export function recordPage(index: PageIndex, id: string, page: number) {
  const current = index.get(id);
  if (!current) {
    index.set(id, { start: page, end: page });
    return;
  }
  if (page < current.start) current.start = page;
  if (page > current.end) current.end = page;
}

export function folioText(start: number, end = start) {
  if (!start) return "";
  return start === end ? String(start) : `${start}\u2013${end}`;
}

export function folioFor(index: PageIndex | null, id: string) {
  if (!index) return "";
  const range = index.get(id);
  if (!range) return "";
  return folioText(range.start, range.end);
}
