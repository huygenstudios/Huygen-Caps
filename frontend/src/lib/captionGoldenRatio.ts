import { MODERN_MINIMALIST_BASE_CONFIG, normalizeModernMinimalistStyleConfig } from "./captionStyleConfig";
import { CaptionStyleConfig } from "./types";

export const GOLDEN_RATIO = 1.61803398875;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function scaledReadableRange(sequenceHeight: number, min1080x1920: number, max1080x1920: number) {
  const heightScale = clamp(sequenceHeight / 1920, 0.56, 1.35);
  const min = Math.round(min1080x1920 * heightScale);
  const max = Math.round(max1080x1920 * heightScale);
  return {
    min: clamp(min, 24, min1080x1920),
    max: clamp(max, min1080x1920, 104),
  };
}

export function getGoldenRatioEditorialDefaults(sequenceWidth: number, sequenceHeight: number): CaptionStyleConfig {
  const safeWidth = Math.max(1, Number.isFinite(sequenceWidth) ? sequenceWidth : 1080);
  const safeHeight = Math.max(1, Number.isFinite(sequenceHeight) ? sequenceHeight : 1920);
  const primaryRange = scaledReadableRange(safeHeight, 42, 76);
  const secondaryRange = scaledReadableRange(safeHeight, 22, 48);
  const primaryFontSize = clamp(Math.round(safeHeight * 0.033), primaryRange.min, primaryRange.max);
  const secondaryFontSize = clamp(Math.round(primaryFontSize / GOLDEN_RATIO), secondaryRange.min, secondaryRange.max);
  const gap = Math.round(secondaryFontSize / 3);
  const positionY = clamp(61.8, 58, 76);

  return normalizeModernMinimalistStyleConfig({
    ...MODERN_MINIMALIST_BASE_CONFIG,
    fontSize: primaryFontSize,
    bigFontSizePx: primaryFontSize,
    smallFontSizePx: secondaryFontSize,
    fontWeight: 900,
    bigFontWeight: 900,
    bigFontStyle: "normal",
    smallFontWeight: 700,
    smallFontStyle: "normal",
    lineHeight: 1.14,
    paddingX: Math.round(primaryFontSize / 2),
    paddingY: Math.round(primaryFontSize / 3),
    positionX: 50,
    positionY,
    scale: 1,
    alignment: "center",
    maxLines: 2,
    maxWidth: safeWidth > safeHeight ? 78 : 86,
    collisionPadding: gap,
    layoutSafeMarginPercent: 8,
    tightness: 0.75,
  });
}
