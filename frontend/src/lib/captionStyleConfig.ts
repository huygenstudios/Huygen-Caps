import { CaptionStyleConfig } from "./types";

export const CREATOR_FONTS = [
  "Poppins",
  "Inter",
  "Montserrat",
  "Roboto",
  "Oswald",
  "Anton",
  "Bebas Neue",
  "Arial",
] as const;

export const FONT_STACKS: Record<string, string> = {
  Poppins: "'Poppins', 'Inter', Arial, sans-serif",
  Inter: "'Inter', Arial, sans-serif",
  Montserrat: "'Montserrat', 'Inter', Arial, sans-serif",
  Roboto: "'Roboto', Arial, sans-serif",
  Oswald: "'Oswald', 'Arial Narrow', Arial, sans-serif",
  Anton: "'Anton', Impact, Arial, sans-serif",
  "Bebas Neue": "'Bebas Neue', 'Arial Narrow', Arial, sans-serif",
  Arial: "Arial, sans-serif",
};

export const DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG: CaptionStyleConfig = {
  presetName: "Word Highlight Box",
  fontFamily: "Poppins",
  fontSize: 58,
  fontWeight: 900,
  textColor: "#FFFFFF",
  activeWordColor: "#FFD43B",
  backgroundEnabled: true,
  backgroundColor: "#000000",
  backgroundOpacity: 0.78,
  borderRadius: 16,
  paddingX: 24,
  paddingY: 14,
  letterSpacing: 0,
  lineHeight: 1.12,
  textTransform: "none",
  textShadowEnabled: true,
  activeWordScale: 1.06,
  activeWordGlow: false,
  animationType: "pop",
  animationStrength: 0.55,
  animationSpeed: 1,
  animationSmoothness: 0.72,
  entranceAnimation: "none",
  backgroundShadow: true,
  safeAreaEnabled: true,
  positionX: 50,
  positionY: 78,
  alignment: "center",
  maxWidth: 86,
};

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function safeColor(value: unknown, fallback: string) {
  return typeof value === "string" && HEX_COLOR_RE.test(value) ? value.toUpperCase() : fallback;
}

function safeFont(value: unknown) {
  return typeof value === "string" && value in FONT_STACKS ? value : DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG.fontFamily;
}

export function resolveFontFamily(fontFamily: string) {
  return FONT_STACKS[fontFamily] || FONT_STACKS[DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG.fontFamily];
}

export function backgroundRgba(config: CaptionStyleConfig) {
  const hex = safeColor(config.backgroundColor, DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG.backgroundColor).replace("#", "");
  const fullHex = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(fullHex.slice(0, 2), 16);
  const g = parseInt(fullHex.slice(2, 4), 16);
  const b = parseInt(fullHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamp(config.backgroundOpacity, 0, 1, 0.78)})`;
}

export function normalizeCaptionStyleConfig(
  raw?: Partial<CaptionStyleConfig> | null
): CaptionStyleConfig {
  const defaults = DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG;
  const merged = { ...defaults, ...(raw || {}) };

  return {
    presetName: typeof merged.presetName === "string" && merged.presetName.trim() ? merged.presetName : defaults.presetName,
    fontFamily: safeFont(merged.fontFamily),
    fontSize: clamp(merged.fontSize, 24, 96, defaults.fontSize),
    fontWeight: [400, 500, 600, 700, 800, 900].includes(Number(merged.fontWeight)) ? Number(merged.fontWeight) : defaults.fontWeight,
    textColor: safeColor(merged.textColor, defaults.textColor),
    activeWordColor: safeColor(merged.activeWordColor, defaults.activeWordColor),
    backgroundEnabled: Boolean(merged.backgroundEnabled),
    backgroundColor: safeColor(merged.backgroundColor, defaults.backgroundColor),
    backgroundOpacity: clamp(merged.backgroundOpacity, 0, 1, defaults.backgroundOpacity),
    borderRadius: clamp(merged.borderRadius, 0, 36, defaults.borderRadius),
    paddingX: clamp(merged.paddingX, 6, 48, defaults.paddingX),
    paddingY: clamp(merged.paddingY, 4, 32, defaults.paddingY),
    letterSpacing: clamp(merged.letterSpacing, -1, 8, defaults.letterSpacing),
    lineHeight: clamp(merged.lineHeight, 0.9, 1.6, defaults.lineHeight),
    textTransform: merged.textTransform === "uppercase" ? "uppercase" : "none",
    textShadowEnabled: Boolean(merged.textShadowEnabled),
    activeWordScale: clamp(merged.activeWordScale, 1, 1.16, defaults.activeWordScale),
    activeWordGlow: Boolean(merged.activeWordGlow),
    animationType: merged.animationType === "bounce" || merged.animationType === "none" ? merged.animationType : "pop",
    animationStrength: clamp(merged.animationStrength, 0, 1.4, defaults.animationStrength),
    animationSpeed: clamp(merged.animationSpeed, 0.4, 2, defaults.animationSpeed),
    animationSmoothness: clamp(merged.animationSmoothness, 0, 1, defaults.animationSmoothness),
    entranceAnimation:
      merged.entranceAnimation === "fade" ||
      merged.entranceAnimation === "pop" ||
      merged.entranceAnimation === "slide_up"
        ? merged.entranceAnimation
        : "none",
    backgroundShadow: Boolean(merged.backgroundShadow),
    safeAreaEnabled: Boolean(merged.safeAreaEnabled),
    positionX: clamp(merged.positionX, 0, 100, defaults.positionX),
    positionY: clamp(merged.positionY, 0, 100, defaults.positionY),
    alignment:
      merged.alignment === "left" || merged.alignment === "right" || merged.alignment === "center"
        ? merged.alignment
        : defaults.alignment,
    maxWidth: clamp(merged.maxWidth, 45, 96, defaults.maxWidth),
  };
}
