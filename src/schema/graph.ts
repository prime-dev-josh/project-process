import { z } from "zod";

export const nodeKindSchema = z.enum(["concept", "category", "task", "info"]);
export const colorBySchema = z.enum(["level", "type", "custom"]);
export const arrowStyleSchema = z.enum(["none", "one", "both"]);
export const linkKindSchema = z.enum(["parent", "cross"]);

const optionalNumber = z.number().optional();

export const graphNodeSchema = z.object({
  id: z.string().min(1).default(() => crypto.randomUUID()),
  title: z.string().default("Untitled"),
  description: z.string().default(""),
  level: z.coerce.number().default(0),
  parentId: z.union([z.string(), z.null()]).optional().default(null),
  type: nodeKindSchema.catch("concept"),
  color: z.string().optional(),
  employee: z.string().default(""),
  employeeEmail: z.string().default(""),
  groupId: z.union([z.string(), z.null()]).optional().default(null),
  size: z.coerce.number().default(1).transform((value) => Math.min(6.5, Math.max(0.5, value))),
  x: optionalNumber,
  y: optionalNumber,
  vx: optionalNumber,
  vy: optionalNumber,
  fx: optionalNumber,
  fy: optionalNumber,
});

function groupParentId(raw: Record<string, unknown>, id: string) {
  const parent = raw.parentId ?? raw.parent_id;
  if (parent == null || parent === "") return null;
  const next = String(parent).trim();
  if (!next || next === "null" || next === "undefined" || next === id) return null;
  return next;
}

export function asGroupRecord(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = raw.id == null ? "" : String(raw.id).trim();
  if (!id) return null;
  const sort = Number(raw.sortOrder ?? raw.sort_order ?? 0);
  const color = raw.color == null || raw.color === "" ? undefined : String(raw.color);
  return {
    id,
    title: String(raw.title ?? "").trim() || "Untitled group",
    ...(color ? { color } : {}),
    parentId: groupParentId(raw, id),
    sortOrder: Number.isFinite(sort) ? sort : 0,
  };
}

export const graphGroupSchema = z.preprocess(
  (value) => asGroupRecord(value) ?? value,
  z.object({
    id: z.string().min(1),
    title: z.string().default("Untitled group"),
    color: z.string().optional(),
    parentId: z.union([z.string(), z.null()]).default(null),
    sortOrder: z.number().default(0),
  }),
);

const linkEndSchema = z
  .union([z.string(), z.object({ id: z.string() })])
  .transform((value) => (typeof value === "string" ? value : value.id));

export const graphLinkSchema = z
  .object({
    id: z.string().optional(),
    source: linkEndSchema,
    target: linkEndSchema,
    kind: linkKindSchema.catch("parent"),
    arrows: arrowStyleSchema.catch("none"),
  })
  .transform((link, ctx) => {
    if (!link.source || !link.target || link.source === link.target) {
      ctx.addIssue({ code: "custom", message: "Link needs two different ends" });
      return z.NEVER;
    }
    return {
      id: link.id || `${link.source}->${link.target}`,
      source: link.source,
      target: link.target,
      kind: link.kind,
      arrows: link.arrows,
    };
  });

export const graphSettingsSchema = z
  .object({
    physics: z.boolean().default(true),
    charge: z.coerce.number().default(-160),
    linkDistance: z.coerce.number().default(72),
    collide: z.coerce.number().default(12),
    radial: z.boolean().default(true),
    colorBy: colorBySchema.catch("level"),
    showText: z.boolean().default(true),
    pulse: z.boolean().optional(),
    pulseSpeed: z.coerce.number().optional(),
    enlarge: z.coerce.number().default(1),
    textScale: z.coerce.number().optional(),
    /** Hover preview card size (device-local view pref). */
    cardScale: z.coerce.number().optional(),
  })
  .transform((raw) => ({
    physics: raw.physics,
    charge: Math.min(-35, Math.max(-1600, raw.charge)),
    linkDistance: Math.min(900, Math.max(0, raw.linkDistance)),
    collide: Math.min(180, Math.max(0, raw.collide)),
    radial: true,
    colorBy: raw.colorBy,
    showText: raw.showText,
    pulse: false,
    pulseSpeed: 0.7,
    enlarge: Math.min(28, Math.max(3, raw.enlarge)),
    textScale: Math.min(4, Math.max(0.7, raw.textScale ?? raw.enlarge)),
    cardScale: Math.min(4, Math.max(0.7, raw.cardScale ?? raw.textScale ?? raw.enlarge)),
  }));

export const graphDocumentInputSchema = z.object({
  nodes: z.array(z.unknown()).default([]),
  links: z.array(z.unknown()).default([]),
  groups: z.array(z.unknown()).optional(),
  settings: z.unknown().optional(),
});

export const graphDocumentSchema = z.object({
  nodes: z.array(graphNodeSchema),
  links: z.array(graphLinkSchema),
  groups: z.array(graphGroupSchema).default([]),
  settings: graphSettingsSchema,
});

export type NodeKind = z.infer<typeof nodeKindSchema>;
export type ColorBy = z.infer<typeof colorBySchema>;
export type ArrowStyle = z.infer<typeof arrowStyleSchema>;
export type LinkKind = z.infer<typeof linkKindSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphLink = z.infer<typeof graphLinkSchema>;
export type GraphGroup = {
  id: string;
  title: string;
  color?: string;
  parentId: string | null;
  sortOrder: number;
};
export type GraphSettings = z.infer<typeof graphSettingsSchema>;
export type GraphDocument = z.infer<typeof graphDocumentSchema>;

export const DEFAULT_SETTINGS: GraphSettings = graphSettingsSchema.parse({});

export function parseGraphDocument(data: unknown): GraphDocument {
  const raw = graphDocumentInputSchema.parse(data);
  return {
    nodes: raw.nodes.map((node) => {
      const parsed = graphNodeSchema.parse(node);
      return { ...parsed, fx: undefined, fy: undefined };
    }),
    links: raw.links.flatMap((link) => {
      const parsed = graphLinkSchema.safeParse(link);
      return parsed.success ? [parsed.data] : [];
    }),
    groups: (raw.groups ?? []).flatMap((group) => {
      const parsed = graphGroupSchema.safeParse(group);
      if (parsed.success) return [parsed.data];
      const loose = asGroupRecord(group);
      return loose ? [loose] : [];
    }),
    settings: graphSettingsSchema.parse(raw.settings ?? {}),
  };
}
