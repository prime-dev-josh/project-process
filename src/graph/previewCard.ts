/** Shared layout for hover preview and flow-step map cards. */
export const PREVIEW_CARD = {
  width: 220,
  titlePx: 11,
  bodyPx: 10,
  labelPx: 8,
  padX: 8,
  padY: 6,
  titleLines: 2,
  bodyLines: 3,
  titleLineGap: 3,
  bodyLineGap: 3,
  titleBodyGap: 2,
  bodyFooterGap: 6,
  footerAvatarPx: 20,
  cornerRadius: 7,
} as const;

export function clampPreviewCardScale(scale: number) {
  return Math.min(4, Math.max(0.7, scale));
}

/** Outer height in screen px (matches NodePreviewPanel shell). */
export function previewCardScreenHeight(scale: number, hasDescription: boolean) {
  const s = clampPreviewCardScale(scale);
  let h = PREVIEW_CARD.padY * 2 * s;
  h += PREVIEW_CARD.titleLines * (PREVIEW_CARD.titlePx * s + PREVIEW_CARD.titleLineGap);
  h += PREVIEW_CARD.titleBodyGap * s;
  if (hasDescription) {
    h += PREVIEW_CARD.bodyLines * (PREVIEW_CARD.bodyPx * s + PREVIEW_CARD.bodyLineGap);
    h += PREVIEW_CARD.bodyFooterGap * s;
  } else {
    h += PREVIEW_CARD.bodyFooterGap * s;
  }
  h += PREVIEW_CARD.labelPx * s + PREVIEW_CARD.footerAvatarPx * s;
  return h;
}

/** Card box in graph coordinates (constant screen size while zooming). */
export function previewCardTypography(scale: number) {
  const s = clampPreviewCardScale(scale);
  return {
    s,
    padX: PREVIEW_CARD.padX * s,
    padY: PREVIEW_CARD.padY * s,
    titleBase: PREVIEW_CARD.titlePx * s,
    bodyBase: PREVIEW_CARD.bodyPx * s,
    titleMin: PREVIEW_CARD.titlePx * s,
    bodyMin: PREVIEW_CARD.bodyPx * s,
    titleLines: PREVIEW_CARD.titleLines,
    bodyLines: PREVIEW_CARD.bodyLines,
    radius: PREVIEW_CARD.cornerRadius * (s / 1.2),
  };
}

export function previewCardGraphBox(globalScale: number, scale: number, hasDescription: boolean) {
  const s = clampPreviewCardScale(scale);
  const k = Math.max(globalScale, 1e-4);
  return {
    w: (PREVIEW_CARD.width * s) / k,
    h: previewCardScreenHeight(s, hasDescription) / k,
    s,
  };
}