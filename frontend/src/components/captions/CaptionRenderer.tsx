"use client";

import React from "react";
import { Caption, CaptionStyle, CaptionStyleConfig, CAPTION_THEMES } from "@/lib/types";
import ViralWordHighlightCaption from "./ViralWordHighlightCaption";
import WordHighlightBoxCaption from "./WordHighlightBoxCaption";

interface Props {
  captions: Caption[];
  currentTime: number;
  fps?: number;
  scale?: number;
  transition?: boolean;
  styleConfig?: Partial<CaptionStyleConfig> | null;
}

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

export default function CaptionRenderer({
  captions,
  currentTime,
  fps = 30,
  scale = 1,
  transition = false,
  styleConfig,
}: Props) {
  const activeCaption = captions.find((c) => currentTime >= c.start && currentTime <= c.end);
  if (!activeCaption) return null;

  if (activeCaption.theme === "word_highlight_box") {
    return (
      <WordHighlightBoxCaption
        caption={activeCaption}
        currentTime={currentTime}
        fps={fps}
        scale={scale}
        transition={transition}
        styleConfig={styleConfig}
      />
    );
  }

  if (activeCaption.theme === "viral_word_highlight" && activeCaption.words?.length) {
    return (
      <ViralWordHighlightCaption
        caption={activeCaption}
        currentTime={currentTime}
        fps={fps}
        scale={scale}
        transition={transition}
      />
    );
  }

  const themeStyle: CaptionStyle =
    activeCaption.style || CAPTION_THEMES[activeCaption.theme] || CAPTION_THEMES.minimal;
  const positionStyle = buildPositionStyle(themeStyle);
  const textShadow = buildTextShadow(themeStyle);
  const fontSize = Math.max(12, Math.round((themeStyle.fontSize || 24) * scale));
  const isOutlineBold = activeCaption.theme === "outline_bold";
  const hasGradient = !!themeStyle.gradient;
  const normalColor = hasGradient ? "transparent" : isOutlineBold ? "transparent" : themeStyle.color || "#ffffff";

  if (activeCaption.words && activeCaption.words.length > 0) {
    const highlightColor = HIGHLIGHT_COLORS[activeCaption.theme] || "#FFD700";
    return (
      <div className="absolute left-0 right-0 flex justify-center pointer-events-none px-4" style={positionStyle}>
        <div
          className="max-w-[85%] flex flex-wrap justify-center gap-x-[0.3em] items-baseline"
          style={{
            backgroundColor: themeStyle.backgroundColor || "transparent",
            borderRadius: themeStyle.borderRadius || "4px",
            padding: themeStyle.padding || "6px 12px",
            ...(themeStyle.backdropBlur
              ? {
                  backdropFilter: `blur(${themeStyle.backdropBlur}px)`,
                  WebkitBackdropFilter: `blur(${themeStyle.backdropBlur}px)`,
                  border: "1px solid rgba(255,255,255,0.15)",
                }
              : {}),
          }}
        >
          {activeCaption.words.map((word, idx) => {
            const isSpoken = currentTime >= word.start;
            const isActive = currentTime >= word.start && currentTime < word.end;
            return (
              <span
                key={`${activeCaption.id}-w${idx}`}
                className="word-pop"
                style={{
                  fontFamily: themeStyle.fontFamily,
                  fontWeight: themeStyle.bold ? 700 : 400,
                  fontStyle: themeStyle.italic ? "italic" : "normal",
                  textShadow,
                  textTransform: themeStyle.textTransform || "none",
                  letterSpacing: themeStyle.letterSpacing || "normal",
                  ...(isOutlineBold ? { WebkitTextStroke: "2px #ffffff" } : {}),
                  fontSize,
                  display: "inline-block",
                  color: isActive ? highlightColor : isSpoken ? normalColor : "rgba(255,255,255,0.15)",
                  opacity: isSpoken ? 1 : 0,
                  transform: isSpoken ? (isActive ? "scale(1.15) translateY(-1px)" : "scale(1)") : "scale(0.6) translateY(8px)",
                  transition: transition ? "all 0.12s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
                  ...(hasGradient && isSpoken && !isActive
                    ? {
                        backgroundImage: themeStyle.gradient,
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                      }
                    : {}),
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

  return (
    <div className="absolute left-0 right-0 flex justify-center pointer-events-none px-4" style={positionStyle}>
      <div
        className="max-w-[85%] text-center leading-snug"
        style={{
          fontSize,
          fontFamily: themeStyle.fontFamily,
          fontWeight: themeStyle.bold ? 700 : 400,
          fontStyle: themeStyle.italic ? "italic" : "normal",
          textShadow,
          textTransform: themeStyle.textTransform || "none",
          letterSpacing: themeStyle.letterSpacing || "normal",
          ...(isOutlineBold ? { WebkitTextStroke: "2px #ffffff" } : {}),
          color: normalColor,
          backgroundColor: hasGradient ? undefined : themeStyle.backgroundColor || "transparent",
          borderRadius: themeStyle.borderRadius || "4px",
          padding: themeStyle.padding || "6px 12px",
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
