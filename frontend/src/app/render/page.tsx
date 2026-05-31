/* Headless Render Page - pixel-perfect caption frame capture for export */

"use client";

import React, { useEffect, useRef, useState } from "react";
import CaptionRenderer from "@/components/captions/CaptionRenderer";
import { normalizeCaptionStyleConfig } from "@/lib/captionStyleConfig";
import { Caption, CaptionStyleConfig, CaptionTheme } from "@/lib/types";

interface RenderState {
  captions: Caption[];
  theme: CaptionTheme;
  styleConfig: CaptionStyleConfig;
  currentTime: number;
  resolution: { width: number; height: number };
  ready: boolean;
}

interface RenderWindow extends Window {
  __RENDER_PAGE_LOADED__?: boolean;
  setCaptionData?: (
    captionsJson: string,
    theme: string,
    resWidth?: number,
    resHeight?: number,
    styleConfigJson?: string
  ) => Promise<boolean>;
  setCaptionTime?: (time: number) => Promise<boolean>;
  isReady?: () => boolean;
}

const DEFAULT_STATE: RenderState = {
  captions: [],
  theme: "word_highlight_box",
  styleConfig: normalizeCaptionStyleConfig(),
  currentTime: 0,
  resolution: { width: 1920, height: 1080 },
  ready: false,
};

export default function RenderPage() {
  const [state, setState] = useState<RenderState>(DEFAULT_STATE);
  const readyRef = useRef(false);

  useEffect(() => {
    const win = window as RenderWindow;

    win.setCaptionData = (
      captionsJson: string,
      theme: string,
      resWidth?: number,
      resHeight?: number,
      styleConfigJson?: string
    ) =>
      new Promise((resolve) => {
        try {
          const captions = JSON.parse(captionsJson) as Caption[];
          const parsedConfig = styleConfigJson ? JSON.parse(styleConfigJson) : undefined;
          readyRef.current = true;
          setState((prev) => ({
            ...prev,
            captions,
            theme: (theme || "word_highlight_box") as CaptionTheme,
            styleConfig: normalizeCaptionStyleConfig(parsedConfig),
            resolution: {
              width: resWidth || 1920,
              height: resHeight || 1080,
            },
            ready: true,
          }));
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
        } catch (e) {
          console.error("setCaptionData error:", e);
          resolve(false);
        }
      });

    win.setCaptionTime = (time: number) =>
      new Promise((resolve) => {
        setState((prev) => ({ ...prev, currentTime: time }));
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
      });

    win.isReady = () => readyRef.current;
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    win.__RENDER_PAGE_LOADED__ = true;

    return () => {
      delete win.setCaptionData;
      delete win.setCaptionTime;
      delete win.isReady;
      delete win.__RENDER_PAGE_LOADED__;
      document.body.style.background = "";
      document.documentElement.style.background = "";
    };
  }, []);

  return (
    <div
      id="render-frame"
      style={{
        width: state.resolution.width,
        height: state.resolution.height,
        position: "relative",
        background: "transparent",
        overflow: "hidden",
      }}
    >
      <CaptionRenderer
        captions={state.captions}
        currentTime={state.currentTime}
        fps={30}
        scale={1}
        transition={false}
        styleConfig={state.styleConfig}
      />
    </div>
  );
}
