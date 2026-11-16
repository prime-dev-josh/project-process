import type { GraphGroup } from "../types";

export const DEFAULT_GROUP_TITLE = "Untitled group";
export const UNGROUPED_FILTER = "__ungrouped__";

/** Distinct membrane colors so neighboring groups stay readable. */
export const GROUP_COLORS = [
  "#f15d2a",
  "#24338a",
  "#00a3bc",
  "#00ad72",
  "#ffc63e",
  "#ce451d",
  "#5462ad",
  "#231b4b",
] as const;

export function groupTitle(title: string | undefined) {
  const next = (title ?? "").trim();
  return next || DEFAULT_GROUP_TITLE;
}

export function normalizeGroupColor(value: string | undefined | null): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase();
  }
  return null;
}

function hashHue(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash;
}

/** Assigned color, or a stable palette pick so older groups still look distinct. */
export function groupPaintColor(group: Pick<GraphGroup, "id" | "color">): string {
  return normalizeGroupColor(group.color) ?? GROUP_COLORS[hashHue(group.id) % GROUP_COLORS.length];
}

export function nextGroupColor(groups: Pick<GraphGroup, "color">[]): string {
  const used = new Set(groups.map((group) => normalizeGroupColor(group.color)).filter(Boolean));
  return GROUP_COLORS.find((color) => !used.has(color)) ?? GROUP_COLORS[used.size % GROUP_COLORS.length];
}

export function groupColorInk(color: string) {
  const hex = normalizeGroupColor(color) ?? color;
  const n = hex.replace("#", "");
  if (n.length !== 6) return "#1f2937";
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 158 ? "#1f2937" : "#fff7ed";
}
