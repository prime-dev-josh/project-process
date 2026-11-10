export const NODE_CLASSES = ["start", "general", "end"] as const;
export type NodeClass = (typeof NODE_CLASSES)[number];

export const NODE_CLASS_SIZE: Record<NodeClass, number> = {
  general: 1.5,
  start: 5.5,
  end: 6.5,
};

export const NODE_CLASS_META: { id: NodeClass; label: string }[] = [
  { id: "start", label: "Start" },
  { id: "general", label: "General" },
  { id: "end", label: "End" },
];

/** Map stored size → class. Anything not near Start/End is General (including old XS–XL). */
export function nodeClassFromSize(size: number | undefined): NodeClass {
  const value = Number.isFinite(size) ? (size as number) : NODE_CLASS_SIZE.general;
  if (Math.abs(value - NODE_CLASS_SIZE.start) <= 0.51) return "start";
  if (Math.abs(value - NODE_CLASS_SIZE.end) <= 0.51) return "end";
  return "general";
}

export function sizeFromNodeClass(cls: NodeClass) {
  return NODE_CLASS_SIZE[cls];
}

export function nodeClassLabel(cls: NodeClass) {
  return NODE_CLASS_META.find((item) => item.id === cls)?.label ?? "General";
}
