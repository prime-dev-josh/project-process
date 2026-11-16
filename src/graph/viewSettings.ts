import { DEFAULT_SETTINGS, graphSettingsSchema, type GraphSettings } from "../schema/graph";

/** Furthest the user (and Fit) can zoom out. Lower lets a huge map shrink more; raising it stops zoom-out sooner. Does not set the intro camera. */
export const GRAPH_MIN_ZOOM = 0.02;
/** Closest wheel-zoom and Fit can go. The intro camera uses REVEAL_ZOOM_MAX instead, which is much lower than this. */
export const GRAPH_MAX_ZOOM = 8;

export const VIEW_SETTING_KEYS = [
  "physics",
  "charge",
  "linkDistance",
  "collide",
  "colorBy",
  "showText",
  "enlarge",
  "textScale",
  "cardScale",
] as const;

/** Five discrete force steps (Advanced sliders). */
export const FORCE_LEVELS = 5;

export const FORCE_INTENSITY = {
  charge: [-80, -220, -450, -800, -1400],
  linkDistance: [50, 160, 320, 560, 900],
  collide: [8, 28, 60, 110, 180],
} as const;

/** Five discrete Look slider steps (Node / Text / hover card). */
export const LOOK_SCALE = {
  enlarge: [3, 6, 11, 18, 28],
  textScale: [0.8, 1.2, 1.8, 2.8, 4],
  cardScale: [0.8, 1.2, 1.8, 2.8, 4],
} as const;

export function nearestForceLevel(values: readonly number[], value: number): number {
  let best = 0;
  let bestDist = Infinity;
  values.forEach((step, index) => {
    const dist = Math.abs(step - value);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  });
  return best;
}

export function snapForceValue(values: readonly number[], value: number) {
  const mid = Math.floor(values.length / 2);
  return values[nearestForceLevel(values, value)] ?? values[mid];
}

export type ViewSettingKey = (typeof VIEW_SETTING_KEYS)[number];

function withForcedPhysics(settings: GraphSettings): GraphSettings {
  return graphSettingsSchema.parse({
    ...settings,
    radial: true,
    charge: snapForceValue(FORCE_INTENSITY.charge, settings.charge),
    linkDistance: snapForceValue(FORCE_INTENSITY.linkDistance, settings.linkDistance),
    collide: snapForceValue(FORCE_INTENSITY.collide, settings.collide),
    enlarge: snapForceValue(LOOK_SCALE.enlarge, settings.enlarge),
    textScale: snapForceValue(LOOK_SCALE.textScale, settings.textScale ?? settings.enlarge),
    cardScale: snapForceValue(LOOK_SCALE.cardScale, settings.cardScale ?? settings.textScale ?? settings.enlarge),
  });
}

export function pickViewSettings(settings: GraphSettings): GraphSettings {
  const picked = {} as GraphSettings;
  for (const key of VIEW_SETTING_KEYS) {
    (picked as Record<ViewSettingKey, GraphSettings[ViewSettingKey]>)[key] = settings[key];
  }
  return withForcedPhysics(graphSettingsSchema.parse({ ...DEFAULT_SETTINGS, ...picked }));
}

export function mergeViewSettings(base: GraphSettings, view?: Partial<GraphSettings> | null): GraphSettings {
  if (!view) return withForcedPhysics(graphSettingsSchema.parse(base));
  const next = { ...base };
  for (const key of VIEW_SETTING_KEYS) {
    if (view[key] !== undefined) {
      (next as Record<ViewSettingKey, GraphSettings[ViewSettingKey]>)[key] = view[key] as GraphSettings[ViewSettingKey];
    }
  }
  return withForcedPhysics(graphSettingsSchema.parse(next));
}

export function sharedSettingsOnly(settings?: Partial<GraphSettings> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!settings) return out;
  for (const [key, value] of Object.entries(settings)) {
    if (VIEW_SETTING_KEYS.includes(key as ViewSettingKey) || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export function hasSharedSettings(settings?: Partial<GraphSettings> | null) {
  return Object.keys(sharedSettingsOnly(settings)).length > 0;
}

export function sharedSettingsChanged(before: GraphSettings, after: GraphSettings) {
  const beforeShared = sharedSettingsOnly(before);
  const afterShared = sharedSettingsOnly(after);
  const keys = new Set([...Object.keys(beforeShared), ...Object.keys(afterShared)]);
  return [...keys].some((key) => beforeShared[key] !== afterShared[key]);
}
