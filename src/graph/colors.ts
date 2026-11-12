import { nodeWorkflowStatus, workflowStatusColor } from "./workflowStatus";
import type { ColorBy, GraphNode, NodeKind } from "../types";

export const LEVEL_COLORS = ["#f43f5e", "#f59e0b", "#34d399"];

/** Shared fill for every canvas node; status is drawn as the border. */
export const NODE_FILL = "#5b9bd5";

export const TYPE_COLORS: Record<NodeKind, string> = {
  concept: "#7dd3fc",
  category: "#e67e22",
  task: "#34d399",
  info: "#c4b5fd",
};

export function sizeForLevel(_level?: number) {
  return 1.5;
}

export function normalizeHex(hex: string) {
  const raw = hex.trim().toLowerCase().replace("#", "");
  if (!raw) return "#000000";
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  return `#${full}`;
}

export function nodeColor(node: GraphNode, colorBy: ColorBy) {
  return workflowStatusColor(nodeWorkflowStatus(node, colorBy));
}

export function hexToRgb(hex: string) {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function withAlpha(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function graphTheme(theme: "light" | "dark") {
  if (theme === "light") {
    return {
      bg: "#f6f7fb",
      link: "rgba(36, 50, 138, 0.32)",
      linkHot: "rgba(36, 50, 138, 0.78)",
      linkCross: "rgba(240, 93, 42, 0.45)",
      linkCrossHot: "rgba(240, 93, 42, 0.82)",
      linkDim: "rgba(36, 50, 138, 0.08)",
      label: "rgba(28, 23, 64, 0.92)",
      labelDim: "rgba(28, 23, 64, 0.32)",
      card: "#ffffff",
      cardText: "#1c1740",
      cardMuted: "rgba(90, 96, 136, 0.92)",
      ring: "#24328a",
      connectRing: "#f05d2a",
    };
  }
  return {
    bg: "#231a4b",
    link: "rgba(247, 246, 251, 0.72)",
    linkHot: "rgba(255, 255, 255, 0.96)",
    linkCross: "rgba(240, 93, 42, 0.8)",
    linkCrossHot: "rgba(255, 140, 96, 1)",
    linkDim: "rgba(247, 246, 251, 0.18)",
    label: "rgba(247, 246, 251, 0.94)",
    labelDim: "rgba(247, 246, 251, 0.34)",
    card: "#312856",
    cardText: "#f7f6fb",
    cardMuted: "rgba(196, 189, 214, 0.9)",
    ring: "#f05d2a",
    connectRing: "#f05d2a",
  };
}
