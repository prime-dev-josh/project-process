import { DEFAULT_SETTINGS, graphSettingsSchema, type GraphSettings } from "../schema/graph";

/** Floor for Fit and wheel zoom-out. The organic layout can span far past 0.12. */
export const GRAPH_MIN_ZOOM = 0.02;
export const GRAPH_MAX_ZOOM = 8;

export const VIEW_SETTING_KEYS = [
  "physics",
  "charge",
  "linkDistance",
  "collide",
  "colorBy",
  "cardInfo",
  "showText",
  "enlarge",
  "textScale",
  "cardScale",
] as const;

/** Three discrete intensities per force — click once, no slider ticks. */
export const FORCE_INTENSITY = {
  charge: [-50, -100, -200],
  linkDistance: [0, 50, 100],
  collide: [0, 5, 10],
} as const;

export const FORCE_INTENSITY_IDS = ["1", "2", "3"] as const;
export type ForceIntensityId = (typeof FORCE_INTENSITY_IDS)[number];

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
  return values[nearestForceLevel(values, value)] ?? values[1];
}

export type ViewSettingKey = (typeof VIEW_SETTING_KEYS)[number];

function withForcedPhysics(settings: GraphSettings): GraphSettings {
  return graphSettingsSchema.parse({
    ...settings,
    radial: true,
    charge: snapForceValue(FORCE_INTENSITY.charge, settings.charge),
    linkDistance: snapForceValue(FORCE_INTENSITY.linkDistance, settings.linkDistance),
    collide: snapForceValue(FORCE_INTENSITY.collide, settings.collide),
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
