"use client";

import React from "react";
import { Caption, CaptionStyle, CaptionStyleConfig, CAPTION_THEMES } from "@/lib/types";
import {
  CaptionCanvasSize,
  SAFE_CAPTION_TEXT_STYLE,
  SafeCaptionLayout,
  buildSafeCaptionPositionStyle,
  resolveSafeCaptionLayout,
} from "@/lib/captionLayoutSafety";
import {
  backgroundRgba,
  directionalShadow,
  normalizeCaptionStyleConfig,
  normalizeModernMinimalistStyleConfig,
  resolveFontFamily,
} from "@/lib/captionStyleConfig";
import { getRenderableCaptionWords, getWordDisplayText } from "@/lib/captionUtils";
import ViralWordHighlightCaption from "./ViralWordHighlightCaption";
import WordHighlightBoxCaption from "./WordHighlightBoxCaption";

interface Props {
  captions: Caption[];
  currentTime: number;
  fps?: number;
  scale?: number;
  transition?: boolean;
  styleConfig?: Partial<CaptionStyleConfig> | null;
  canvasSize?: CaptionCanvasSize;
}

type TimedCaptionWord = {
  word: string;
  displayedWord?: string;
  originalWord?: string;
  start: number;
  end: number;
  score: number;
};

const HIGHLIGHT_COLORS: Record<string, string> = {
  word_highlight_box: "#FFD43B",
  viral_word_highlight: "#22f4b8",
  viral_shorts: "#FFD700",
  kalakar_fire: "#ff6b35",
  karaoke_neon: "#00ff88",
  neon_glow: "#00ffff",
  gradient_wave: "#ff6ec7",
  comic_pop: "#FFD700",
};

function buildPositionStyle(themeStyle: CaptionStyle): React.CSSProperties {
  const positionStyle: React.CSSProperties = {};
  if (themeStyle.position === "bottom") {
    positionStyle.bottom = "8%";
  } else if (themeStyle.position === "top") {
    positionStyle.top = "8%";
  } else {
    positionStyle.top = "50%";
    positionStyle.transform = "translateY(-50%)";
  }
  return positionStyle;
}

function buildTextShadow(themeStyle: CaptionStyle): string | undefined {
  const parts: string[] = [];
  if (themeStyle.outline && themeStyle.outlineColor) {
    const c = themeStyle.outlineColor;
    parts.push(
      `2px 2px 0 ${c}`,
      `-2px -2px 0 ${c}`,
      `2px -2px 0 ${c}`,
      `-2px 2px 0 ${c}`,
      `1px 1px 0 ${c}`,
      `-1px -1px 0 ${c}`,
      `1px -1px 0 ${c}`,
      `-1px 1px 0 ${c}`
    );
  }
  if (themeStyle.shadow && themeStyle.shadow !== "none") {
    parts.push(themeStyle.shadow);
  }
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function buildConfigTextShadow(config: CaptionStyleConfig) {
  const shadows = [
    config.textShadowEnabled
      ? directionalShadow(
          config.textShadowColor,
          config.textShadowOpacity,
          config.textShadowDistance,
          config.textShadowBlur,
          config.textShadowAngle
        )
      : "",
    config.textStrokeEnabled ? `0 3px 0 ${config.textStrokeColor}` : "",
  ].filter(Boolean);
  return shadows.length ? shadows.join(", ") : undefined;
}

function justifyFromAlignment(alignment: CaptionStyleConfig["alignment"]) {
  return alignment === "left" ? "flex-start" : alignment === "right" ? "flex-end" : "center";
}

function buildConfigPositionStyle(config: CaptionStyleConfig, layout?: SafeCaptionLayout): React.CSSProperties {
  return buildSafeCaptionPositionStyle(config, layout || resolveSafeCaptionLayout(config));
}

function buildCaptionSurfaceStyle(config: CaptionStyleConfig, scale: number): React.CSSProperties {
  return {
    maxWidth: "100%",
    padding: config.backgroundEnabled
      ? `${Math.max(0, config.paddingY * scale)}px ${Math.max(0, config.paddingX * scale)}px`
      : 0,
    borderRadius: config.backgroundEnabled ? Math.max(0, config.borderRadius * scale) : 0,
    background: config.backgroundEnabled ? backgroundRgba(config) : "transparent",
    border: config.backgroundBorderEnabled
      ? `${Math.max(0, config.backgroundBorderWidth * scale)}px solid ${config.backgroundBorderColor}`
      : "none",
    boxShadow: config.backgroundEnabled && config.backgroundShadow
      ? directionalShadow(
          config.backgroundShadowColor,
          config.backgroundShadowOpacity,
          config.backgroundShadowDistance * scale,
          config.backgroundShadowBlur * scale,
          config.backgroundShadowAngle
        )
      : undefined,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function interpolate(input: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const t = clamp((input - inMin) / Math.max(0.0001, inMax - inMin), 0, 1);
  return outMin + (outMax - outMin) * t;
}

function easeOutExpo(t: number) {
  const safe = clamp(t, 0, 1);
  return safe === 1 ? 1 : 1 - Math.pow(2, -10 * safe);
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function combineTransforms(...parts: string[]) {
  return parts.filter(Boolean).join(" ").trim() || "translateY(0) scale(1)";
}

function wordMotionTransform(ageFrames: number, config: CaptionStyleConfig, isAnchor = false) {
  if (config.animationType === "none" || config.animationStrength <= 0 || ageFrames < 0) {
    return "translateY(0) scale(1)";
  }

  const speed = Math.max(0.4, config.animationSpeed) * (isAnchor ? 0.9 : 1);
  const smoothness = clamp(config.animationSmoothness, 0, 1);
  const peakFrame = Math.max(2, (3 + smoothness * 2) / speed);
  const settleFrame = Math.max(peakFrame + 2, (8 + smoothness * 4) / speed);
  const maxScale = 1 + (config.activeWordScale - 1) * config.animationStrength;
  const lift = (config.animationType === "bounce" ? -4 : -2.5) * config.animationStrength;

  if (ageFrames <= peakFrame) {
    const startScale = interpolate(config.animationStrength, 0, 1.4, 1, 0.98);
    const scale = interpolate(ageFrames, 0, peakFrame, startScale, maxScale);
    const y = interpolate(ageFrames, 0, peakFrame, 5 * config.animationStrength, lift);
    return `translateY(${y}px) scale(${scale})`;
  }

  if (ageFrames <= settleFrame) {
    const settle = config.animationType === "bounce" && ageFrames < settleFrame - 2 ? 0.98 : 1;
    const scale = interpolate(ageFrames, peakFrame, settleFrame, maxScale, settle);
    const y = interpolate(ageFrames, peakFrame, settleFrame, lift, 0);
    return `translateY(${y}px) scale(${scale})`;
  }

  return "translateY(0) scale(1)";
}

function wordEntranceStyle(wordStart: number, currentTime: number, fps: number, config: CaptionStyleConfig): React.CSSProperties {
  if (currentTime < wordStart) return { opacity: 0, transform: "translateY(0) scale(1)" };
  if (config.entranceAnimation === "none" || config.entranceAnimation === "hard_cut") {
    return { opacity: 1, transform: "translateY(0) scale(1)", filter: "none" };
  }

  const ageFrames = Math.max(0, (currentTime - wordStart) * fps);
  const duration = Math.max(2, Math.round(8 / Math.max(0.4, config.animationSpeed)));
  const progress = easeOutExpo(ageFrames / duration);

  if (config.entranceAnimation === "fade") {
    return { opacity: progress, transform: "translateY(0) scale(1)", filter: "none" };
  }
  if (config.entranceAnimation === "pop") {
    const start = 0.9;
    return { opacity: progress, transform: `translateY(0) scale(${interpolate(progress, 0, 1, start, 1)})`, filter: "none" };
  }
  if (config.entranceAnimation === "slide_up") {
    return { opacity: progress, transform: `translateY(${(1 - progress) * 16}px) scale(1)`, filter: "none" };
  }
  if (config.entranceAnimation === "blur_fade") {
    return {
      opacity: progress,
      transform: `translateY(${(1 - progress) * 8}px) scale(1)`,
      filter: `blur(${(1 - progress) * 8}px)`,
    };
  }

  return { opacity: 1, transform: "translateY(0) scale(1)" };
}

function buildTimedWords(activeCaption: Caption): TimedCaptionWord[] {
  const renderableWords = getRenderableCaptionWords(activeCaption);
  if (renderableWords.length) {
    return renderableWords.map((word) => ({ ...word, word: getWordDisplayText(word) }));
  }

  const tokens = activeCaption.text.split(/\s+/).filter(Boolean);
  const duration = Math.max(0.08, activeCaption.end - activeCaption.start);
  return tokens.map((word, index) => {
    const start = activeCaption.start + (duration / Math.max(1, tokens.length)) * index;
    return {
      word,
      displayedWord: word,
      originalWord: word,
      start,
      end: start + duration / Math.max(1, tokens.length),
      score: 0,
    };
  });
}

function classifyMrBeastWord(word: string, config: CaptionStyleConfig) {
  if (!config.smartHighlightEnabled) return config.textColor;
  const clean = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  const money = new Set(["money", "cash", "dollar", "rupee", "lakh", "crore", "win", "winning", "prize"]);
  const shock = new Set(["today", "now", "fast", "secret", "surprise", "insane", "crazy"]);
  const danger = new Set(["fail", "mistake", "danger", "lose", "lost", "wrong", "problem"]);
  if (money.has(clean)) return config.emphasisGreenColor || "#00FF00";
  if (shock.has(clean)) return config.emphasisYellowColor || "#FFFF00";
  if (danger.has(clean)) return config.emphasisRedColor || "#FF0000";
  return config.textColor;
}

function mrBeastPopScale(ageFrames: number, config: CaptionStyleConfig) {
  if (ageFrames < 0) return 0;
  const peak = Math.max(1.02, config.activeWordScale);
  const undershoot = Math.max(0.9, 1 - config.animationStrength * 0.035);
  if (ageFrames <= 1) return interpolate(ageFrames, 0, 1, 0, peak);
  if (ageFrames <= 3) return interpolate(ageFrames, 1, 3, peak, undershoot);
  if (ageFrames <= 5) return interpolate(ageFrames, 3, 5, undershoot, 1);
  return 1;
}

function renderMrBeastStyle(
  activeCaption: Caption,
  currentTime: number,
  fps: number,
  scale: number,
  styleConfig?: Partial<CaptionStyleConfig> | null,
  canvasSize?: CaptionCanvasSize
) {
  const config = normalizeCaptionStyleConfig(styleConfig);
  const words = buildTimedWords(activeCaption);
  const layout = resolveSafeCaptionLayout(config, { canvas: canvasSize, previewScale: scale, words });
  const fontSize = layout.fontSize;
  const positionStyle = buildConfigPositionStyle(config, layout);
  const strokeWidth = Math.max(1, config.textStrokeWidth * scale);
  const shadow = [
    `0 ${Math.round(7 * scale)}px 0 ${config.textStrokeColor}`,
    `0 ${Math.round(13 * scale)}px ${Math.round(18 * scale)}px rgba(0,0,0,0.72)`,
  ].join(", ");

  return (
    <div style={positionStyle} data-caption-theme="mrbeast_style">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: justifyFromAlignment(config.alignment),
          alignItems: "center",
          maxWidth: "100%",
          gap: "0.18em",
          textAlign: config.alignment,
          lineHeight: config.lineHeight,
          ...SAFE_CAPTION_TEXT_STYLE,
        }}
      >
        {words.map((word, index) => {
          const ageFrames = (currentTime - word.start) * fps;
          const visible = currentTime >= word.start;
          const entrance = wordEntranceStyle(word.start, currentTime, fps, config);
          const popScale = config.animationType === "none" ? 1 : mrBeastPopScale(ageFrames, config);
          const tiltSeed = stableHash(`${activeCaption.id}-${word.originalWord || word.word}-${index}`);
          const tilt = config.randomTiltEnabled ? (tiltSeed % 61) / 10 - 3 : 0;
          return (
            <span
              key={`${activeCaption.id}-mb-${index}-${word.start}`}
              style={{
                display: "inline-block",
                fontFamily: resolveFontFamily(config.fontFamily),
                fontSize,
                fontWeight: 900,
                letterSpacing: `${config.letterSpacing}px`,
                color: classifyMrBeastWord(word.word, config),
                textTransform: "uppercase",
                WebkitTextStroke: `${strokeWidth}px ${config.textStrokeColor}`,
                paintOrder: "stroke fill",
                textShadow: shadow,
                opacity: visible ? entrance.opacity ?? 1 : 0,
                transform: combineTransforms(`rotate(${tilt}deg)`, entrance.transform || "", `scale(${popScale})`),
                transformOrigin: "50% 58%",
                ...SAFE_CAPTION_TEXT_STYLE,
              }}
            >
              {word.word}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function renderAppleCinematic(
  activeCaption: Caption,
  currentTime: number,
  scale: number,
  styleConfig?: Partial<CaptionStyleConfig> | null,
  canvasSize?: CaptionCanvasSize
) {
  const config = normalizeCaptionStyleConfig(styleConfig);
  const words = buildTimedWords(activeCaption);
  const layout = resolveSafeCaptionLayout(config, { canvas: canvasSize, previewScale: scale, words });
  const fontSize = layout.fontSize;
  const positionStyle = buildConfigPositionStyle(config, layout);
  const revealDuration = config.revealDuration || 0.32;
  const yOffset = (config.revealYOffset || 30) * scale;
  const blur = config.revealBlur || 25;

  return (
    <div style={positionStyle} data-caption-theme="apple_cinematic">
      <div
        style={{
          maxWidth: "100%",
          textAlign: config.alignment,
          lineHeight: config.lineHeight,
          fontFamily: resolveFontFamily(config.fontFamily),
          fontSize,
          fontWeight: config.fontWeight,
          letterSpacing: `${config.letterSpacing}px`,
          color: config.textColor,
          textShadow: buildConfigTextShadow(config),
          ...SAFE_CAPTION_TEXT_STYLE,
        }}
      >
        {words.map((word, index) => {
          const progress = easeOutExpo((currentTime - word.start) / revealDuration);
          return (
            <span
              key={`${activeCaption.id}-apple-${index}-${word.start}`}
              style={{
                display: "inline-block",
                marginRight: "0.28em",
                opacity: progress,
                transform: `translateY(${(1 - progress) * yOffset}px)`,
                filter: `blur(${(1 - progress) * blur}px)`,
                ...SAFE_CAPTION_TEXT_STYLE,
              }}
            >
              {word.word}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function isPunctuationOnly(word: string) {
  return /^[^a-z0-9]+$/i.test(word.trim());
}

function normalizeLockupWords(words: TimedCaptionWord[]) {
  const normalized: TimedCaptionWord[] = [];
  for (const word of words) {
    const text = word.word.trim();
    if (!text) continue;
    if (isPunctuationOnly(text) && normalized.length > 0) {
      const previous = normalized[normalized.length - 1];
      normalized[normalized.length - 1] = { ...previous, word: `${previous.word}${text}`, end: Math.max(previous.end, word.end) };
    } else {
      normalized.push({ ...word, word: text });
    }
  }
  return normalized;
}

function lineLength(words: TimedCaptionWord[]) {
  return words.map((word) => word.word).join(" ").length;
}

function balanceModernMinimalistLines(words: TimedCaptionWord[]) {
  if (words.length <= 1) return words.length ? [words] : [];

  const totalLength = lineLength(words);
  const longestWord = Math.max(...words.map((word) => word.word.length));
  if (words.length <= 3 && totalLength <= 14 && longestWord <= 8) {
    return [words];
  }

  let bestSplit = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let split = 1; split < words.length; split += 1) {
    const first = words.slice(0, split);
    const second = words.slice(split);
    const firstLength = lineLength(first);
    const secondLength = lineLength(second);
    const singleTinyLastWordPenalty = second.length === 1 && secondLength <= 4 ? 4 : 0;
    const score = Math.abs(firstLength - secondLength) + singleTinyLastWordPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestSplit = split;
    }
  }

  return [words.slice(0, bestSplit), words.slice(bestSplit)];
}

function modernCanvasSize(canvasSize?: CaptionCanvasSize) {
  return {
    width: Math.max(1, canvasSize?.width || 1080),
    height: Math.max(1, canvasSize?.height || 1920),
  };
}

function resolveModernMinimalistFontSize(
  config: CaptionStyleConfig,
  lines: TimedCaptionWord[][],
  canvasSize: CaptionCanvasSize | undefined,
  layout: SafeCaptionLayout,
  scale: number
) {
  const canvas = modernCanvasSize(canvasSize);
  const responsiveScale = canvas.height >= canvas.width ? canvas.height / 1920 : canvas.width / 1080;
  const baseFont = (config.fontSize || 112) * responsiveScale * scale;
  const maxLineLength = Math.max(1, ...lines.map(lineLength));
  const lineHeight = clamp(Number(config.lineHeight) || 0.95, 0.9, 1.05);
  const availableWidth = canvas.width * scale * (layout.widthPercent / 100) * 0.98;
  const availableHeight = canvas.height * scale * (layout.maxHeightPercent / 100) * 0.92;
  const weightFactor = Number(config.fontWeight) >= 800 ? 0.58 : 0.54;
  const widthFit = availableWidth / (maxLineLength * weightFactor);
  const heightFit = availableHeight / (Math.max(1, lines.length) * lineHeight);
  const maxFont = 132 * scale * responsiveScale;
  const minFont = 18 * scale;

  return Math.max(minFont, Math.min(baseFont, widthFit, heightFit, maxFont));
}

function renderModernMinimalistLockup(
  activeCaption: Caption,
  currentTime: number,
  fps: number,
  scale: number,
  styleConfig?: Partial<CaptionStyleConfig> | null,
  canvasSize?: CaptionCanvasSize
) {
  if (currentTime < activeCaption.start || currentTime >= activeCaption.end) return null;

  const config = normalizeModernMinimalistStyleConfig(styleConfig);
  const words = normalizeLockupWords(buildTimedWords(activeCaption));
  const revealed = words.filter((word) => currentTime >= word.start && currentTime < activeCaption.end);
  if (revealed.length === 0) return null;
  const lines = balanceModernMinimalistLines(revealed);
  const layoutSafety = resolveSafeCaptionLayout(config, {
    canvas: canvasSize,
    previewScale: scale,
    words,
    text: activeCaption.text,
    safety: {
      maxWidthPercent: 86,
      maxHeightPercent: 45,
      safeMarginPercent: 8,
      defaultFontSize: 112,
      minFontSize: 18,
      maxFontSize: 132,
      defaultScale: 1,
      minScale: 0,
      maxScale: 4,
      lineClamp: 2,
      wrapMode: "balanced",
    },
  });
  const positionStyle = buildConfigPositionStyle(config, layoutSafety);
  const fontSize = resolveModernMinimalistFontSize(config, lines, canvasSize, layoutSafety, scale);
  const textShadow = buildConfigTextShadow(config);
  const stroke = config.textStrokeEnabled ? `${Math.max(0.5, config.textStrokeWidth * scale)}px ${config.textStrokeColor}` : undefined;
  const lineHeight = clamp(Number(config.lineHeight) || 0.95, 0.9, 1.05);

  return (
    <div style={positionStyle} data-caption-theme="modern_minimalist_lockup">
      <div
        style={{
          ...buildCaptionSurfaceStyle(config, scale),
          display: "flex",
          width: "100%",
          maxWidth: "100%",
          flexDirection: "column",
          alignItems: config.alignment === "left" ? "flex-start" : config.alignment === "right" ? "flex-end" : "center",
          justifyContent: "center",
          gap: 0,
          textAlign: config.alignment,
          lineHeight,
          overflow: "hidden",
          ...SAFE_CAPTION_TEXT_STYLE,
        }}
      >
        {lines.map((line, lineIndex) => (
          <div
            key={`${activeCaption.id}-modern-line-${lineIndex}`}
            style={{
              display: "block",
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
              lineHeight,
              textAlign: config.alignment,
              ...SAFE_CAPTION_TEXT_STYLE,
            }}
          >
            {line.map((word, wordIndex) => {
              const entrance = wordEntranceStyle(word.start, currentTime, fps, config);
              const ageFrames = Math.max(0, (currentTime - word.start) * fps);
              const motion = wordMotionTransform(ageFrames, config);
              return (
                <React.Fragment key={`${activeCaption.id}-modern-${lineIndex}-${wordIndex}-${word.start}`}>
                  <span
                    style={{
                      display: "inline-block",
                      maxWidth: "100%",
                      fontFamily: resolveFontFamily(config.fontFamily),
                      fontSize,
                      fontWeight: config.fontWeight,
                      color: config.textColor,
                      letterSpacing: `${config.letterSpacing}px`,
                      lineHeight,
                      textAlign: config.alignment,
                      textTransform: config.textTransform,
                      textShadow,
                      WebkitTextStroke: stroke,
                      paintOrder: stroke ? "stroke fill" : undefined,
                      opacity: entrance.opacity,
                      transform: combineTransforms(entrance.transform || "", motion),
                      filter: entrance.filter || "none",
                      transformOrigin: "50% 70%",
                      ...SAFE_CAPTION_TEXT_STYLE,
                    }}
                  >
                    {word.word}
                  </span>
                  {wordIndex < line.length - 1 ? " " : null}
                </React.Fragment>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderKineticWords(
  activeCaption: Caption,
  currentTime: number,
  fps: number,
  style: CaptionStyle,
  scale: number,
  styleConfig?: Partial<CaptionStyleConfig> | null,
  canvasSize?: CaptionCanvasSize
) {
  const config = normalizeCaptionStyleConfig(styleConfig);
  const tokens = buildTimedWords(activeCaption);
  const layout = resolveSafeCaptionLayout(config, { canvas: canvasSize, previewScale: scale, words: tokens, text: activeCaption.text });
  const fontSize = layout.fontSize;
  const textShadow = buildConfigTextShadow(config) || buildTextShadow(style);
  const positionStyle = buildConfigPositionStyle(config, layout);

  return (
    <div style={positionStyle}>
      <div className="max-w-full leading-snug" style={{ textAlign: config.alignment, ...SAFE_CAPTION_TEXT_STYLE }}>
        {tokens.map((word, index) => {
          const progress = Math.max(0, Math.min(1, (currentTime - word.start) / 0.18));
          const entrance = wordEntranceStyle(word.start, currentTime, fps, config);
          const ageFrames = Math.max(0, (currentTime - word.start) * fps);
          const motion = wordMotionTransform(ageFrames, config);
          return (
            <span
              key={`${activeCaption.id}-kf-${index}`}
              style={{
                display: "inline-block",
                marginRight: "0.28em",
                fontSize,
                fontFamily: resolveFontFamily(config.fontFamily),
                fontWeight: config.fontWeight,
                color: config.textColor || style.color || "#fff",
                textShadow,
                letterSpacing: `${config.letterSpacing}px`,
                textTransform: config.textTransform,
                opacity: Number(entrance.opacity ?? 1) * progress,
                transform: combineTransforms(
                  entrance.transform || "",
                  `translateY(${(1 - progress) * 10}px) scale(${0.92 + progress * 0.08})`,
                  motion
                ),
                ...SAFE_CAPTION_TEXT_STYLE,
              }}
            >
              {word.word}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function renderAttentionPunch(
  activeCaption: Caption,
  currentTime: number,
  fps: number,
  style: CaptionStyle,
  scale: number,
  transition: boolean,
  styleConfig?: Partial<CaptionStyleConfig> | null,
  canvasSize?: CaptionCanvasSize
) {
  const config = normalizeCaptionStyleConfig(styleConfig);
  const words = buildTimedWords(activeCaption);
  const layout = resolveSafeCaptionLayout(config, { canvas: canvasSize, previewScale: scale, words, text: activeCaption.text });
  const fontSize = layout.fontSize;
  const positionStyle = buildConfigPositionStyle(config, layout);
  const activeIndex = words.findIndex((word) => currentTime >= word.start && currentTime < word.end);
  return (
    <div style={positionStyle}>
      <div className="flex max-w-full flex-wrap gap-x-[0.28em] leading-tight" style={{ justifyContent: justifyFromAlignment(config.alignment), ...SAFE_CAPTION_TEXT_STYLE }}>
        {words.map((word, index) => {
          const active = index === activeIndex;
          const spoken = currentTime >= word.start;
          const entrance = wordEntranceStyle(word.start, currentTime, fps, config);
          const ageFrames = Math.max(0, (currentTime - word.start) * fps);
          const motion = wordMotionTransform(ageFrames, config);
          return (
            <span
              key={`${activeCaption.id}-ap-${index}`}
              style={{
                display: "inline-block",
                fontSize,
                fontFamily: resolveFontFamily(config.fontFamily),
                fontWeight: config.fontWeight,
                color: active ? config.activeWordColor : config.textColor,
                letterSpacing: `${config.letterSpacing}px`,
                textTransform: config.textTransform,
                WebkitTextStroke: config.textStrokeEnabled ? `${config.textStrokeWidth * scale}px ${config.textStrokeColor}` : undefined,
                textShadow: active ? `0 0 12px ${config.activeWordColor}, 0 4px 0 #000` : buildConfigTextShadow(config) || "0 4px 0 #000",
                opacity: spoken ? entrance.opacity ?? 1 : 0,
                transform: combineTransforms(
                  entrance.transform || "",
                  motion,
                  active ? `translateY(-2px) scale(${config.activeWordScale})` : "translateY(0) scale(1)"
                ),
                transition: transition ? "transform 100ms ease, color 90ms linear" : "none",
                ...SAFE_CAPTION_TEXT_STYLE,
              }}
            >
              {word.word}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function CaptionRenderer({
  captions,
  currentTime,
  fps = 30,
  scale = 1,
  transition = false,
  styleConfig,
  canvasSize,
}: Props) {
  const edgeGraceSeconds = Math.max(1 / Math.max(1, fps), 0.08);
  const exactActiveCaption = [...captions]
    .filter((caption) => currentTime >= caption.start && currentTime < caption.end)
    .sort((a, b) => (b.start - a.start) || (a.end - b.end))[0];
  const activeCaption = exactActiveCaption || [...captions]
    .filter((caption) => currentTime >= caption.start - edgeGraceSeconds && currentTime < caption.end + edgeGraceSeconds)
    .sort((a, b) => {
      const aDistance = currentTime < a.start ? a.start - currentTime : currentTime - a.end;
      const bDistance = currentTime < b.start ? b.start - currentTime : currentTime - b.end;
      return aDistance - bDistance || b.start - a.start;
    })[0];
  if (!activeCaption) return null;

  const resolvedConfig = normalizeCaptionStyleConfig(styleConfig);

  if (activeCaption.theme === "word_highlight_box") {
    return (
      <WordHighlightBoxCaption
        caption={activeCaption}
        currentTime={currentTime}
        fps={fps}
        scale={scale}
        transition={transition}
        styleConfig={styleConfig}
        canvasSize={canvasSize}
      />
    );
  }

  if (activeCaption.theme === "kinetic_fade") {
    return renderKineticWords(activeCaption, currentTime, fps, CAPTION_THEMES.kinetic_fade, scale, styleConfig, canvasSize);
  }

  if (activeCaption.theme === "attention_punch") {
    return renderAttentionPunch(activeCaption, currentTime, fps, CAPTION_THEMES.attention_punch, scale, transition, styleConfig, canvasSize);
  }

  if (activeCaption.theme === "mrbeast_style") {
    return renderMrBeastStyle(activeCaption, currentTime, fps, scale, styleConfig, canvasSize);
  }

  if (activeCaption.theme === "apple_cinematic") {
    return renderAppleCinematic(activeCaption, currentTime, scale, styleConfig, canvasSize);
  }

  if (activeCaption.theme === "modern_minimalist_lockup") {
    return renderModernMinimalistLockup(activeCaption, currentTime, fps, scale, styleConfig, canvasSize);
  }

  if (activeCaption.theme === "viral_word_highlight") {
    return (
      <ViralWordHighlightCaption
        caption={activeCaption}
        currentTime={currentTime}
        fps={fps}
        scale={scale}
        transition={transition}
        styleConfig={resolvedConfig}
        canvasSize={canvasSize}
      />
    );
  }

  const themeStyle: CaptionStyle =
    activeCaption.style || CAPTION_THEMES[activeCaption.theme] || CAPTION_THEMES.minimal;
  const useConfigSurface = Boolean(styleConfig);
  const fallbackWords = getRenderableCaptionWords(activeCaption);
  const fallbackLayout = useConfigSurface
    ? resolveSafeCaptionLayout(resolvedConfig, { canvas: canvasSize, previewScale: scale, words: fallbackWords, text: activeCaption.text })
    : undefined;
  const positionStyle = useConfigSurface ? buildConfigPositionStyle(resolvedConfig, fallbackLayout) : buildPositionStyle(themeStyle);
  const textShadow = useConfigSurface ? buildConfigTextShadow(resolvedConfig) || buildTextShadow(themeStyle) : buildTextShadow(themeStyle);
  const fontSize = useConfigSurface
    ? fallbackLayout?.fontSize || Math.max(0, Math.round(resolvedConfig.fontSize * scale))
    : Math.max(0, Math.round((themeStyle.fontSize || 24) * scale));
  const isOutlineBold = activeCaption.theme === "outline_bold";
  const hasGradient = !useConfigSurface && !!themeStyle.gradient;
  const normalColor = hasGradient
    ? "transparent"
    : useConfigSurface
    ? resolvedConfig.textColor
    : isOutlineBold
    ? "transparent"
    : themeStyle.color || "#ffffff";
  const highlightColor = useConfigSurface ? resolvedConfig.activeWordColor : HIGHLIGHT_COLORS[activeCaption.theme] || "#FFD700";
  const fallbackSurfaceStyle = useConfigSurface
    ? buildCaptionSurfaceStyle(resolvedConfig, scale)
    : {
        backgroundColor: themeStyle.backgroundColor || "transparent",
        borderRadius: themeStyle.borderRadius || "4px",
        padding: themeStyle.padding || "6px 12px",
      };
  const fallbackFontFamily = useConfigSurface ? resolveFontFamily(resolvedConfig.fontFamily) : themeStyle.fontFamily;
  const fallbackFontWeight = useConfigSurface ? resolvedConfig.fontWeight : themeStyle.bold ? 700 : 400;
  const fallbackTextTransform = useConfigSurface ? resolvedConfig.textTransform : themeStyle.textTransform || "none";
  const fallbackLetterSpacing = useConfigSurface ? `${resolvedConfig.letterSpacing}px` : themeStyle.letterSpacing || "normal";
  const fallbackAlignment = useConfigSurface ? resolvedConfig.alignment : "center";

  if (fallbackWords.length > 0) {
    return (
      <div className={useConfigSurface ? "pointer-events-none" : "absolute left-0 right-0 flex justify-center pointer-events-none px-4"} style={positionStyle}>
        <div
          className="max-w-[85%] flex flex-wrap justify-center gap-x-[0.3em] items-baseline"
          style={{
            ...fallbackSurfaceStyle,
            justifyContent: justifyFromAlignment(fallbackAlignment),
            maxHeight: fallbackLayout ? "100%" : undefined,
            overflow: "hidden",
            ...SAFE_CAPTION_TEXT_STYLE,
            ...(themeStyle.backdropBlur
              ? {
                  backdropFilter: `blur(${themeStyle.backdropBlur}px)`,
                  WebkitBackdropFilter: `blur(${themeStyle.backdropBlur}px)`,
                  border: "1px solid rgba(255,255,255,0.15)",
                }
              : {}),
          }}
        >
          {fallbackWords.map((word, idx) => {
            const isSpoken = currentTime >= word.start;
            const isActive = currentTime >= word.start && currentTime < word.end;
            const ageFrames = Math.max(0, (currentTime - word.start) * fps);
            const motion = wordMotionTransform(ageFrames, resolvedConfig);
            const entrance = wordEntranceStyle(word.start, currentTime, fps, resolvedConfig);
            return (
              <span
                key={`${activeCaption.id}-w${idx}`}
                className="word-pop"
                style={{
                  fontFamily: fallbackFontFamily,
                  fontWeight: fallbackFontWeight,
                  fontStyle: themeStyle.italic ? "italic" : "normal",
                  textShadow,
                  textTransform: fallbackTextTransform,
                  letterSpacing: fallbackLetterSpacing,
                  ...(isOutlineBold ? { WebkitTextStroke: "2px #ffffff" } : {}),
                  fontSize,
                  display: "inline-block",
                  color: isActive ? highlightColor : isSpoken ? normalColor : "rgba(255,255,255,0.15)",
                  opacity: isSpoken ? entrance.opacity ?? 1 : 0,
                  transform: isSpoken
                    ? combineTransforms(
                        entrance.transform || "",
                        motion,
                        isActive ? "scale(1.15) translateY(-1px)" : "scale(1)"
                      )
                    : "scale(0.6) translateY(8px)",
                  transition: transition ? "all 0.12s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
                  ...SAFE_CAPTION_TEXT_STYLE,
                  ...(hasGradient && isSpoken && !isActive
                    ? {
                        backgroundImage: themeStyle.gradient,
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                      }
                    : {}),
                }}
              >
                {getWordDisplayText(word)}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={useConfigSurface ? "pointer-events-none" : "absolute left-0 right-0 flex justify-center pointer-events-none px-4"} style={positionStyle}>
      <div
        className="max-w-[85%] text-center leading-snug"
        style={{
          ...fallbackSurfaceStyle,
          fontSize,
          fontFamily: fallbackFontFamily,
          fontWeight: fallbackFontWeight,
          fontStyle: themeStyle.italic ? "italic" : "normal",
          textShadow,
          textTransform: fallbackTextTransform,
          letterSpacing: fallbackLetterSpacing,
          ...(isOutlineBold ? { WebkitTextStroke: "2px #ffffff" } : {}),
          color: normalColor,
          textAlign: fallbackAlignment,
          overflow: "hidden",
          ...SAFE_CAPTION_TEXT_STYLE,
          ...(hasGradient
            ? {
                backgroundImage: themeStyle.gradient,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
              }
            : {}),
        }}
      >
        {activeCaption.text}
      </div>
    </div>
  );
}
