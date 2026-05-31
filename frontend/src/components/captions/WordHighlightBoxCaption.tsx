"use client";

import React from "react";
import { Caption, CaptionStyleConfig } from "@/lib/types";
import { backgroundRgba, normalizeCaptionStyleConfig, resolveFontFamily } from "@/lib/captionStyleConfig";
import { getActiveWordIndex, wordActivationProgressFrames } from "@/lib/captionUtils";

interface Props {
  caption: Caption;
  currentTime: number;
  styleConfig?: Partial<CaptionStyleConfig> | null;
  fps?: number;
  scale?: number;
  transition?: boolean;
}

function interpolate(input: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const t = Math.max(0, Math.min(1, (input - inMin) / (inMax - inMin)));
  return outMin + (outMax - outMin) * t;
}

function activeWordTransform(
  ageFrames: number,
  config: CaptionStyleConfig
) {
  if (config.animationType === "none" || config.animationStrength <= 0) {
    return "translateY(0) scale(1)";
  }

  const speed = Math.max(0.4, config.animationSpeed);
  const smoothness = Math.max(0, Math.min(1, config.animationSmoothness));
  const peakFrame = Math.max(2, (3 + smoothness * 2) / speed);
  const settleFrame = Math.max(peakFrame + 2, (8 + smoothness * 4) / speed);
  const maxScale = 1 + (config.activeWordScale - 1) * config.animationStrength;
  const lift = config.animationType === "bounce" ? -4 * config.animationStrength : -2.5 * config.animationStrength;

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

function entranceTransform(currentTime: number, captionStart: number, config: CaptionStyleConfig, fps: number) {
  const ageFrames = Math.max(0, (currentTime - captionStart) * fps);
  const speed = Math.max(0.4, config.animationSpeed);
  const duration = Math.max(2, 8 / speed);
  const progress = Math.max(0, Math.min(1, ageFrames / duration));

  if (config.entranceAnimation === "fade") {
    return { opacity: progress, transform: "translate(-50%, -50%) scale(1)" };
  }
  if (config.entranceAnimation === "pop") {
    const boxScale = interpolate(progress, 0, 1, 0.92, 1);
    return { opacity: progress, transform: `translate(-50%, -50%) scale(${boxScale})` };
  }
  if (config.entranceAnimation === "slide_up") {
    const y = interpolate(progress, 0, 1, 12, 0);
    return { opacity: progress, transform: `translate(-50%, calc(-50% + ${y}px)) scale(1)` };
  }

  return { opacity: 1, transform: "translate(-50%, -50%) scale(1)" };
}

export default function WordHighlightBoxCaption({
  caption,
  currentTime,
  styleConfig,
  fps = 30,
  scale = 1,
  transition = false,
}: Props) {
  const config = normalizeCaptionStyleConfig(styleConfig);
  const words = (caption.words || []).filter((word) => word.word && word.end > word.start);
  const fontSize = Math.max(14, Math.round(config.fontSize * scale));

  if (words.length === 0) {
    return (
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "78%",
          transform: "translate(-50%, -50%)",
          maxWidth: "86%",
          padding: "10px 14px",
          borderRadius: 10,
          background: "rgba(120, 20, 20, 0.86)",
          color: "#fff",
          fontFamily: "'Inter', Arial, sans-serif",
          fontSize: Math.max(12, Math.round(18 * scale)),
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.25,
        }}
      >
        Word-level timestamps are required for automatic word highlighting.
      </div>
    );
  }

  const activeIndex = getActiveWordIndex(words, currentTime);
  const safeX = Math.max(config.safeAreaEnabled ? 5 : 0, Math.min(config.safeAreaEnabled ? 95 : 100, config.positionX));
  const safeY = Math.max(config.safeAreaEnabled ? 8 : 0, Math.min(config.safeAreaEnabled ? 92 : 100, config.positionY));
  const entrance = entranceTransform(currentTime, caption.start, config, fps);

  const justifyContent =
    config.alignment === "left" ? "flex-start" : config.alignment === "right" ? "flex-end" : "center";
  const textAlign = config.alignment;
  const boxShadow = [
    config.backgroundShadow ? "0 8px 28px rgba(0,0,0,0.42)" : "",
    config.textShadowEnabled ? "0 2px 2px rgba(0,0,0,0.45)" : "",
  ].filter(Boolean).join(", ");

  return (
    <div
      data-caption-theme="word_highlight_box"
      style={{
        position: "absolute",
        left: `${safeX}%`,
        top: `${safeY}%`,
        transform: entrance.transform,
        opacity: entrance.opacity,
        display: "flex",
        justifyContent,
        width: `${config.maxWidth}%`,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          flexWrap: "wrap",
          justifyContent,
          alignItems: "center",
          maxWidth: "100%",
          columnGap: "0.32em",
          rowGap: "0.08em",
          padding: `${Math.max(4, config.paddingY * scale)}px ${Math.max(6, config.paddingX * scale)}px`,
          borderRadius: Math.max(0, config.borderRadius * scale),
          background: config.backgroundEnabled ? backgroundRgba(config) : "transparent",
          boxShadow,
          lineHeight: config.lineHeight,
          textAlign,
          transform: "translateZ(0)",
          overflowWrap: "anywhere",
        }}
      >
        {words.map((word, index) => {
          const isActive = index === activeIndex;
          const ageFrames = wordActivationProgressFrames(word, currentTime, fps);
          const glow = config.activeWordGlow && isActive
            ? `0 0 ${Math.round(14 * config.animationStrength)}px ${config.activeWordColor}`
            : "";
          const textShadow = config.textShadowEnabled
            ? [
                "0 2px 0 rgba(0,0,0,0.95)",
                "1px 1px 0 rgba(0,0,0,0.8)",
                "-1px 1px 0 rgba(0,0,0,0.8)",
                glow,
              ].filter(Boolean).join(", ")
            : glow || undefined;

          return (
            <span
              key={`${caption.id}-${index}-${word.start}`}
              data-active-word={isActive ? "true" : "false"}
              style={{
                display: "inline-block",
                fontFamily: resolveFontFamily(config.fontFamily),
                fontSize,
                fontWeight: config.fontWeight,
                letterSpacing: `${config.letterSpacing}px`,
                lineHeight: config.lineHeight,
                textTransform: config.textTransform,
                color: isActive ? config.activeWordColor : config.textColor,
                transform: isActive ? activeWordTransform(ageFrames, config) : "translateY(0) scale(1)",
                transition: transition
                  ? "transform 120ms cubic-bezier(0.45, 0, 0.2, 1), color 100ms linear, text-shadow 100ms linear"
                  : "none",
                textShadow,
                willChange: "transform, color",
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
