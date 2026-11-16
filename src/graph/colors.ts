import { nodeWorkflowStatus, workflowStatusColor } from "./workflowStatus";
import type { ColorBy, GraphNode, NodeKind } from "../types";

export const LEVEL_COLORS = ["#ce451d", "#ffc63e", "#00ad72"];

/** Shared fill for every canvas node; status is drawn as the border. Light indigo. */
export const NODE_FILL = "#5462ad";

export const TYPE_COLORS: Record<NodeKind, string> = {
  concept: "#5462ad",
  category: "#f15d2a",
  task: "#00ad72",
  info: "#00a3bc",
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
      bg: "#f1f3f7",
      link: "rgba(35, 27, 75, 0.38)",
      linkHot: "rgba(36, 51, 138, 0.9)",
      linkCross: "rgba(241, 93, 42, 0.55)",
      linkCrossHot: "rgba(206, 69, 29, 0.9)",
      linkDim: "rgba(35, 27, 75, 0.1)",
      label: "rgba(35, 27, 75, 0.94)",
      labelDim: "rgba(35, 27, 75, 0.36)",
      card: "#ffffff",
      cardText: "#231b4b",
      cardMuted: "rgba(84, 98, 173, 0.95)",
      ring: "#f15d2a",
      connectRing: "#24338a",
    };
  }
  return {
    bg: "#231b4b",
    link: "rgba(241, 243, 247, 0.62)",
    linkHot: "rgba(255, 255, 255, 0.96)",
    linkCross: "rgba(241, 93, 42, 0.85)",
    linkCrossHot: "rgba(241, 93, 42, 1)",
    linkDim: "rgba(206, 206, 220, 0.18)",
    label: "rgba(255, 255, 255, 0.94)",
    labelDim: "rgba(206, 206, 220, 0.55)",
    card: "#322c64",
    cardText: "#ffffff",
    cardMuted: "rgba(206, 206, 220, 0.9)",
    ring: "#f15d2a",
    connectRing: "#5462ad",
  };
}
