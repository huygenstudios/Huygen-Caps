"use client";

import React from "react";
import { AlignedWord, Caption } from "@/lib/types";
import { getActiveWordIndex, wordActivationProgressFrames } from "@/lib/captionUtils";

interface Props {
  caption: Caption;
  currentTime: number;
  fps?: number;
  scale?: number;
  transition?: boolean;
}

function interpolate(input: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  const t = Math.max(0, Math.min(1, (input - inMin) / (inMax - inMin)));
  return outMin + (outMax - outMin) * t;
}

function activeWordTransform(word: AlignedWord, currentTime: number, fps: number) {
  const ageFrames = wordActivationProgressFrames(word, currentTime, fps);
  let scale = 1;
  let y = 0;

  if (ageFrames <= 2) {
    scale = interpolate(ageFrames, 0, 2, 0.92, 1.12);
    y = interpolate(ageFrames, 0, 2, 5, -3);
  } else if (ageFrames <= 7) {
    scale = interpolate(ageFrames, 2, 7, 1.12, 1);
    y = interpolate(ageFrames, 2, 7, -3, 0);
  }

  return `translateY(${y}px) scale(${scale})`;
}

export default function ViralWordHighlightCaption({
  caption,
  currentTime,
  fps = 30,
  scale = 1,
  transition = false,
}: Props) {
  const words = caption.words || [];
  const activeIndex = getActiveWordIndex(words, currentTime);
  const fontSize = Math.max(18, Math.round(64 * scale));
  const paddingY = Math.max(8, Math.round(14 * scale));
  const paddingX = Math.max(12, Math.round(22 * scale));

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "13%",
        display: "flex",
        justifyContent: "center",
        paddingLeft: Math.max(16, 40 * scale),
        paddingRight: Math.max(16, 40 * scale),
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: "88%",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "baseline",
          columnGap: "0.35em",
          rowGap: "0.08em",
          padding: `${paddingY}px ${paddingX}px`,
          borderRadius: 8,
          background: "rgba(0, 0, 0, 0.88)",
          boxShadow: "0 6px 22px rgba(0,0,0,0.58)",
          lineHeight: 1.08,
          textAlign: "center",
          transform: "translateZ(0)",
        }}
      >
        {words.map((word, index) => {
          const isActive = index === activeIndex;
          return (
            <span
              key={`${caption.id}-${index}-${word.start}`}
              style={{
                display: "inline-block",
                fontFamily: "'Inter', 'Arial Black', sans-serif",
                fontSize,
                fontWeight: 900,
                letterSpacing: 0,
                textTransform: "uppercase",
                color: isActive ? "#22f4b8" : "#ffffff",
                opacity: currentTime >= caption.start && currentTime <= caption.end ? 1 : 0,
                transform: isActive ? activeWordTransform(word, currentTime, fps) : "translateY(0) scale(1)",
                transition: transition
                  ? "transform 80ms cubic-bezier(0.34, 1.56, 0.64, 1), color 80ms linear"
                  : "none",
                textShadow: isActive
                  ? "0 0 12px rgba(34,244,184,0.75), 0 3px 0 #000, 2px 2px 0 #000, -2px 2px 0 #000"
                  : "0 3px 0 #000, 2px 2px 0 #000, -2px 2px 0 #000",
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

