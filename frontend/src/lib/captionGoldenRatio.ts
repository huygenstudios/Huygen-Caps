import { MODERN_MINIMALIST_BASE_CONFIG, normalizeModernMinimalistStyleConfig } from "./captionStyleConfig";
import { CaptionStyleConfig } from "./types";

export const GOLDEN_RATIO = 1.61803398875;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getGoldenRatioEditorialDefaults(sequenceWidth: number, sequenceHeight: number): CaptionStyleConfig {
  const safeHeight = Math.max(1, Number.isFinite(sequenceHeight) ? sequenceHeight : 1920);
  const primaryFontSize = clamp(Math.round(safeHeight * 0.033), 42, 72);
  const secondaryFontSize = Math.round(primaryFontSize / GOLDEN_RATIO);
  const gap = Math.round(secondaryFontSize / 3);
  const positionY = clamp(61.8, 58, 76);

  return normalizeModernMinimalistStyleConfig({
    ...MODERN_MINIMALIST_BASE_CONFIG,
    fontSize: primaryFontSize,
    bigFontSizePx: primaryFontSize,
    smallFontSizePx: secondaryFontSize,
    fontWeight: 900,
    lineHeight: 1.14,
    paddingX: Math.round(primaryFontSize / 2),
    paddingY: Math.round(primaryFontSize / 3),
    positionX: 50,
    positionY,
    scale: 1,
    alignment: "center",
    maxLines: 2,
    maxWidth: sequenceWidth > sequenceHeight ? 78 : 86,
    collisionPadding: gap,
    layoutSafeMarginPercent: 8,
    tightness: 0.75,
  });
}
