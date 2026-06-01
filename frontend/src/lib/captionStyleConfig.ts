import { CaptionStyleConfig } from "./types";

export const CREATOR_FONTS = [
  "Komika Axis",
  "CCSignLanguage",
  "Obelix Pro",
  "Poppins",
  "Inter",
  "SF Pro Display",
  "Helvetica Neue",
  "Montserrat",
  "Roboto",
  "Oswald",
  "Anton",
  "Bebas Neue",
  "Impact",
  "Arial Black",
  "Georgia",
  "Arial",
] as const;

export const FONT_STACKS: Record<string, string> = {
  "Komika Axis": "'Komika Axis', 'CCSignLanguage', 'Obelix Pro', 'Anton', Impact, 'Arial Black', sans-serif",
  CCSignLanguage: "'CCSignLanguage', 'Komika Axis', 'Anton', Impact, 'Arial Black', sans-serif",
  "Obelix Pro": "'Obelix Pro', 'Komika Axis', 'Anton', Impact, 'Arial Black', sans-serif",
  Poppins: "'Poppins', 'Inter', Arial, sans-serif",
  Inter: "'Inter', Arial, sans-serif",
  "SF Pro Display": "'SF Pro Display', 'Inter', 'Helvetica Neue', Arial, sans-serif",
  "Helvetica Neue": "'Helvetica Neue', Inter, Arial, sans-serif",
  Montserrat: "'Montserrat', 'Inter', Arial, sans-serif",
  Roboto: "'Roboto', Arial, sans-serif",
  Oswald: "'Oswald', 'Arial Narrow', Arial, sans-serif",
  Anton: "'Anton', Impact, Arial, sans-serif",
  "Bebas Neue": "'Bebas Neue', 'Arial Narrow', Arial, sans-serif",
  Impact: "Impact, 'Arial Black', sans-serif",
  "Arial Black": "'Arial Black', Impact, sans-serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  Arial: "Arial, sans-serif",
};

export const DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG: CaptionStyleConfig = {
  presetName: "Word Highlight Box",
  fontFamily: "Poppins",
  fontSize: 54,
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
  textStrokeEnabled: false,
  textStrokeColor: "#000000",
  textStrokeWidth: 0,
  textShadowColor: "#000000",
  textShadowOpacity: 0.45,
  textShadowBlur: 2,
  textShadowDistance: 2,
  textShadowAngle: 90,
  activeWordScale: 1.06,
  activeWordGlow: false,
  activeWordBackgroundEnabled: false,
  activeWordBackgroundColor: "#000000",
  activeWordBackgroundOpacity: 0.35,
  activeWordBackgroundPaddingX: 6,
  activeWordBackgroundPaddingY: 2,
  activeWordBackgroundBorderRadius: 8,
  animationType: "pop",
  animationStrength: 0.55,
  animationSpeed: 1,
  animationSmoothness: 0.72,
  entranceAnimation: "none",
  backgroundShadow: true,
  backgroundBorderEnabled: false,
  backgroundBorderColor: "#FFFFFF",
  backgroundBorderWidth: 0,
  backgroundShadowColor: "#000000",
  backgroundShadowOpacity: 0.42,
  backgroundShadowBlur: 28,
  backgroundShadowDistance: 8,
  backgroundShadowAngle: 90,
  safeAreaEnabled: true,
  positionX: 50,
  positionY: 78,
  scale: 1,
  rotation: 0,
  opacity: 1,
  alignment: "center",
  maxWidth: 82,
  randomTiltEnabled: false,
  smartHighlightEnabled: false,
  emphasisGreenColor: "#00FF00",
  emphasisYellowColor: "#FFFF00",
  emphasisRedColor: "#FF0000",
  revealDuration: 0.28,
  revealYOffset: 30,
  revealBlur: 25,
  phraseHoldDuration: 0.2,
  anchorSizeMultiplier: 1.45,
  supportSizeMultiplier: 0.36,
  layoutMode: "auto",
  tightness: 0.88,
  hardCutReveal: true,
};

export const MODERN_MINIMALIST_BASE_CONFIG: CaptionStyleConfig = {
  ...DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG,
  presetName: "Modern Minimalist Build",
  fontFamily: "Inter",
  fontSize: 112,
  fontWeight: 900,
  textColor: "#FFFFFF",
  activeWordColor: "#FFFFFF",
  backgroundEnabled: false,
  backgroundOpacity: 0,
  backgroundShadow: false,
  backgroundBorderEnabled: false,
  lineHeight: 0.95,
  textTransform: "none",
  textShadowEnabled: false,
  textStrokeEnabled: false,
  textShadowColor: "#000000",
  textShadowOpacity: 0.25,
  textShadowBlur: 8,
  textShadowDistance: 2,
  textShadowAngle: 90,
  activeWordScale: 1,
  animationType: "none",
  animationStrength: 0,
  animationSpeed: 1,
  animationSmoothness: 0,
  entranceAnimation: "slide_up",
  safeAreaEnabled: true,
  positionX: 50,
  positionY: 50,
  scale: 1,
  rotation: 0,
  opacity: 1,
  alignment: "center",
  maxWidth: 86,
  anchorSizeMultiplier: 1,
  supportSizeMultiplier: 1,
  layoutMode: "auto",
  tightness: 0.95,
  hardCutReveal: false,
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

function safeLayoutMode(value: unknown) {
  return value === "a" || value === "b" || value === "c" || value === "auto" ? value : DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG.layoutMode;
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

export function colorToRgba(color: string, opacity: number) {
  const hex = safeColor(color, "#000000").replace("#", "");
  const fullHex = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(fullHex.slice(0, 2), 16);
  const g = parseInt(fullHex.slice(2, 4), 16);
  const b = parseInt(fullHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamp(opacity, 0, 1, 1)})`;
}

export function directionalShadow(
  color: string,
  opacity: number,
  distance: number,
  blur: number,
  angle: number
) {
  if (opacity <= 0 || (distance <= 0 && blur <= 0)) return "";
  const radians = (angle * Math.PI) / 180;
  const x = Math.cos(radians) * distance;
  const y = Math.sin(radians) * distance;
  return `${x.toFixed(1)}px ${y.toFixed(1)}px ${Math.max(0, blur)}px ${colorToRgba(color, opacity)}`;
}

export function normalizeCaptionStyleConfig(
  raw?: Partial<CaptionStyleConfig> | null
): CaptionStyleConfig {
  const defaults = DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG;
  const merged = { ...defaults, ...(raw || {}) };

  return {
    presetName: typeof merged.presetName === "string" && merged.presetName.trim() ? merged.presetName : defaults.presetName,
    fontFamily: safeFont(merged.fontFamily),
    fontSize: clamp(merged.fontSize, 0, 180, defaults.fontSize),
    fontWeight: [400, 500, 600, 700, 800, 900].includes(Number(merged.fontWeight)) ? Number(merged.fontWeight) : defaults.fontWeight,
    textColor: safeColor(merged.textColor, defaults.textColor),
    activeWordColor: safeColor(merged.activeWordColor, defaults.activeWordColor),
    backgroundEnabled: Boolean(merged.backgroundEnabled),
    backgroundColor: safeColor(merged.backgroundColor, defaults.backgroundColor),
    backgroundOpacity: clamp(merged.backgroundOpacity, 0, 1, defaults.backgroundOpacity),
    borderRadius: clamp(merged.borderRadius, 0, 36, defaults.borderRadius),
    paddingX: clamp(merged.paddingX, 6, 48, defaults.paddingX),
    paddingY: clamp(merged.paddingY, 4, 32, defaults.paddingY),
    letterSpacing: clamp(merged.letterSpacing, -2, 8, defaults.letterSpacing),
    lineHeight: clamp(merged.lineHeight, 0.9, 1.6, defaults.lineHeight),
    textTransform: merged.textTransform === "uppercase" ? "uppercase" : "none",
    textShadowEnabled: Boolean(merged.textShadowEnabled),
    textStrokeEnabled: Boolean(merged.textStrokeEnabled),
    textStrokeColor: safeColor(merged.textStrokeColor, defaults.textStrokeColor),
    textStrokeWidth: clamp(merged.textStrokeWidth, 0, 8, defaults.textStrokeWidth),
    textShadowColor: safeColor(merged.textShadowColor, defaults.textShadowColor),
    textShadowOpacity: clamp(merged.textShadowOpacity, 0, 1, defaults.textShadowOpacity),
    textShadowBlur: clamp(merged.textShadowBlur, 0, 24, defaults.textShadowBlur),
    textShadowDistance: clamp(merged.textShadowDistance, 0, 24, defaults.textShadowDistance),
    textShadowAngle: clamp(merged.textShadowAngle, 0, 360, defaults.textShadowAngle),
    activeWordScale: clamp(merged.activeWordScale, 1, 1.16, defaults.activeWordScale),
    activeWordGlow: Boolean(merged.activeWordGlow),
    activeWordBackgroundEnabled: Boolean(merged.activeWordBackgroundEnabled),
    activeWordBackgroundColor: safeColor(merged.activeWordBackgroundColor, defaults.activeWordBackgroundColor),
    activeWordBackgroundOpacity: clamp(merged.activeWordBackgroundOpacity, 0, 1, defaults.activeWordBackgroundOpacity),
    activeWordBackgroundPaddingX: clamp(merged.activeWordBackgroundPaddingX, 0, 28, defaults.activeWordBackgroundPaddingX),
    activeWordBackgroundPaddingY: clamp(merged.activeWordBackgroundPaddingY, 0, 18, defaults.activeWordBackgroundPaddingY),
    activeWordBackgroundBorderRadius: clamp(merged.activeWordBackgroundBorderRadius, 0, 28, defaults.activeWordBackgroundBorderRadius),
    animationType: merged.animationType === "bounce" || merged.animationType === "none" ? merged.animationType : "pop",
    animationStrength: clamp(merged.animationStrength, 0, 1.4, defaults.animationStrength),
    animationSpeed: clamp(merged.animationSpeed, 0.4, 2, defaults.animationSpeed),
    animationSmoothness: clamp(merged.animationSmoothness, 0, 1, defaults.animationSmoothness),
    entranceAnimation:
      merged.entranceAnimation === "hard_cut" ||
      merged.entranceAnimation === "fade" ||
      merged.entranceAnimation === "pop" ||
      merged.entranceAnimation === "slide_up" ||
      merged.entranceAnimation === "blur_fade"
        ? merged.entranceAnimation
        : "none",
    backgroundShadow: Boolean(merged.backgroundShadow),
    backgroundBorderEnabled: Boolean(merged.backgroundBorderEnabled),
    backgroundBorderColor: safeColor(merged.backgroundBorderColor, defaults.backgroundBorderColor),
    backgroundBorderWidth: clamp(merged.backgroundBorderWidth, 0, 8, defaults.backgroundBorderWidth),
    backgroundShadowColor: safeColor(merged.backgroundShadowColor, defaults.backgroundShadowColor),
    backgroundShadowOpacity: clamp(merged.backgroundShadowOpacity, 0, 1, defaults.backgroundShadowOpacity),
    backgroundShadowBlur: clamp(merged.backgroundShadowBlur, 0, 60, defaults.backgroundShadowBlur),
    backgroundShadowDistance: clamp(merged.backgroundShadowDistance, 0, 36, defaults.backgroundShadowDistance),
    backgroundShadowAngle: clamp(merged.backgroundShadowAngle, 0, 360, defaults.backgroundShadowAngle),
    safeAreaEnabled: Boolean(merged.safeAreaEnabled),
    positionX: clamp(merged.positionX, 0, 100, defaults.positionX),
    positionY: clamp(merged.positionY, 0, 100, defaults.positionY),
    scale: clamp(merged.scale, 0, 4, defaults.scale),
    rotation: clamp(merged.rotation, -180, 180, defaults.rotation),
    opacity: clamp(merged.opacity, 0, 1, defaults.opacity),
    alignment:
      merged.alignment === "left" || merged.alignment === "right" || merged.alignment === "center"
        ? merged.alignment
        : defaults.alignment,
    maxWidth: clamp(merged.maxWidth, 45, 96, defaults.maxWidth),
    randomTiltEnabled: Boolean(merged.randomTiltEnabled),
    smartHighlightEnabled: Boolean(merged.smartHighlightEnabled),
    emphasisGreenColor: safeColor(merged.emphasisGreenColor, defaults.emphasisGreenColor || "#00FF00"),
    emphasisYellowColor: safeColor(merged.emphasisYellowColor, defaults.emphasisYellowColor || "#FFFF00"),
    emphasisRedColor: safeColor(merged.emphasisRedColor, defaults.emphasisRedColor || "#FF0000"),
    revealDuration: clamp(merged.revealDuration, 0.08, 0.9, defaults.revealDuration || 0.28),
    revealYOffset: clamp(merged.revealYOffset, 0, 80, defaults.revealYOffset || 30),
    revealBlur: clamp(merged.revealBlur, 0, 40, defaults.revealBlur || 25),
    phraseHoldDuration: clamp(merged.phraseHoldDuration, 0, 2, defaults.phraseHoldDuration || 0.2),
    anchorSizeMultiplier: clamp(merged.anchorSizeMultiplier, 1.1, 2.8, defaults.anchorSizeMultiplier || 1.75),
    supportSizeMultiplier: clamp(merged.supportSizeMultiplier, 0.25, 0.8, defaults.supportSizeMultiplier || 0.42),
    layoutMode: safeLayoutMode(merged.layoutMode),
    tightness: clamp(merged.tightness, 0.5, 1.2, defaults.tightness || 0.88),
    hardCutReveal: merged.hardCutReveal !== false,
  };
}

export function normalizeModernMinimalistStyleConfig(
  raw?: Partial<CaptionStyleConfig> | null
): CaptionStyleConfig {
  const presetName = typeof raw?.presetName === "string" ? raw.presetName.toLowerCase() : "";
  const isModernConfig = presetName.includes("modern minimalist");
  const normalized = normalizeCaptionStyleConfig({
    ...MODERN_MINIMALIST_BASE_CONFIG,
    ...(isModernConfig ? raw : {}),
  });

  return {
    ...normalized,
    backgroundShadow: normalized.backgroundEnabled && normalized.backgroundShadow,
    backgroundBorderEnabled: normalized.backgroundEnabled && normalized.backgroundBorderEnabled,
  };
}
