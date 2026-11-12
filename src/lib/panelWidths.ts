export const PANEL_IDS = ["left", "edit", "history", "info"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

const STORAGE_KEY = "project-process.panel-widths";

const FALLBACK_DEFAULTS: Record<PanelId, number> = {
  left: 280,
  edit: 480,
  history: 380,
  info: 360,
};

const MIN_WIDTH: Record<PanelId, number> = {
  left: 220,
  edit: 260,
  history: 260,
  info: 280,
};

export function defaultPanelWidth(id: PanelId): number {
  if (typeof window === "undefined") return FALLBACK_DEFAULTS[id];
  if (id === "edit") return Math.round(window.innerWidth * 0.34);
  return FALLBACK_DEFAULTS[id];
}

export function minPanelWidth(id: PanelId): number {
  return MIN_WIDTH[id];
}

export function maxPanelWidth(id: PanelId): number {
  if (typeof window === "undefined") return 720;
  const vw = window.innerWidth;
  if (id === "left" || id === "edit") return Math.round(Math.min(vw * 0.72, vw - 96));
  return Math.round(Math.min(vw * 0.55, vw - 48));
}

export function clampPanelWidth(width: number, min: number, max: number): number {
  if (!Number.isFinite(width)) return min;
  return Math.round(Math.min(max, Math.max(min, width)));
}

export function clampStoredPanelWidth(id: PanelId, width: number): number {
  return clampPanelWidth(width, minPanelWidth(id), maxPanelWidth(id));
}

function readAll(): Partial<Record<PanelId, number>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Partial<Record<PanelId, number>> = {};
    for (const id of PANEL_IDS) {
      const value = parsed[id];
      if (typeof value === "number" && Number.isFinite(value)) next[id] = value;
    }
    return next;
  } catch {
    return {};
  }
}

export function loadPanelWidth(id: PanelId): number {
  const stored = readAll()[id];
  return clampStoredPanelWidth(id, stored ?? defaultPanelWidth(id));
}

export function savePanelWidth(id: PanelId, width: number) {
  if (typeof window === "undefined") return;
  try {
    const all = readAll();
    all[id] = clampStoredPanelWidth(id, width);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota / private mode */
  }
}
