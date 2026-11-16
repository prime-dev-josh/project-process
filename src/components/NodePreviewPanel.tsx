import type { CSSProperties } from "react";
import { nodeColor } from "../graph/colors";
import { clampPreviewCardScale, PREVIEW_CARD } from "../graph/previewCard";
import { cx } from "../styles";
import type { ColorBy, GraphNode } from "../types";
import PersonFace from "./PersonFace";

type Props = {
  node: GraphNode;
  colorBy: ColorBy;
  /** Device view pref: scales the hover card (not map labels). */
  scale?: number;
  style: CSSProperties;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
};

export default function NodePreviewPanel({
  node,
  colorBy,
  scale = 1.2,
  style,
  onPointerEnter,
  onPointerLeave,
}: Props) {
  const accent = nodeColor(node, colorBy);
  const employee = node.employee?.trim() ?? "";
  const description = node.description?.trim() ?? "";
  const s = clampPreviewCardScale(scale);

  const previewLabel = {
    fontSize: `${PREVIEW_CARD.labelPx * s}px`,
  } as const;

  return (
    <div
      className={cx(
        "edit-float is-tinted fixed z-[86] rounded-md border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow)]",
      )}
      style={{
        ...style,
        ["--edit-accent" as string]: accent,
        width: `min(${PREVIEW_CARD.width * s}px, calc(100vw - 24px))`,
        padding: `${PREVIEW_CARD.padY * s}px ${PREVIEW_CARD.padX * s}px`,
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <h3
        className="mt-0 line-clamp-2 font-semibold leading-tight text-[var(--text)]"
        style={{ marginBottom: `${PREVIEW_CARD.titleBodyGap * s}px`, fontSize: `${PREVIEW_CARD.titlePx * s}px` }}
      >
        {node.title || "Untitled"}
      </h3>
      {description ? (
        <p
          className="mt-0 line-clamp-3 leading-snug text-[var(--muted)]"
          style={{ marginBottom: `${PREVIEW_CARD.bodyFooterGap * s}px`, fontSize: `${PREVIEW_CARD.bodyPx * s}px` }}
        >
          {description}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 shrink-0">
          <span className="mb-0 block font-bold tracking-wide text-[var(--muted)] uppercase" style={previewLabel}>
            Status
          </span>
          <div className="flex items-center" style={{ minHeight: `${PREVIEW_CARD.footerAvatarPx * s}px` }}>
            <span
              className="edit-size-node pointer-events-none block rounded-full bg-[var(--edit-accent,var(--accent))]"
              style={{ width: PREVIEW_CARD.labelPx * 1.25 * s, height: PREVIEW_CARD.labelPx * 1.25 * s }}
              title={accent}
              aria-label="Node status"
            />
          </div>
        </div>
        <div className="min-w-0 flex-1 text-right">
          <span className="mb-0 block font-bold tracking-wide text-[var(--muted)] uppercase" style={previewLabel}>
            Assignee
          </span>
          <div className="flex items-center justify-end" style={{ minHeight: `${PREVIEW_CARD.footerAvatarPx * s}px` }}>
            {employee ? (
              <span
                className="inline-flex overflow-hidden rounded-full"
                style={{ width: PREVIEW_CARD.footerAvatarPx * s, height: PREVIEW_CARD.footerAvatarPx * s }}
                title={employee}
                aria-label={employee}
              >
                <PersonFace name={employee} email={node.employeeEmail} />
              </span>
            ) : (
              <span
                className="inline-flex rounded-full border border-dashed border-[var(--muted)] bg-transparent"
                style={{ width: PREVIEW_CARD.footerAvatarPx * s, height: PREVIEW_CARD.footerAvatarPx * s }}
                aria-label="No assignee"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}