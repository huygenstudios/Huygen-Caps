/* CaptionOverlay - frame-aware caption preview */

"use client";

import React, { useCallback, useRef } from "react";
import CaptionRenderer from "@/components/captions/CaptionRenderer";
import { useCaptionStore } from "@/store/captionStore";
import { useEditorStore } from "@/store/editorStore";
import { usePlaybackStore } from "@/store/playbackStore";

export default function CaptionOverlay() {
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const showOverlay = usePlaybackStore((s) => s.showCaptionOverlay);
  const captions = useCaptionStore((s) => s.captions);
  const captionStyleConfig = useEditorStore((s) => s.captionStyleConfig);
  const setCaptionLayerTransform = useEditorStore((s) => s.setCaptionLayerTransform);
  const draggingRef = useRef(false);

  const updatePositionFromPointer = useCallback(
    (event: PointerEvent | React.PointerEvent<HTMLDivElement>, element: HTMLDivElement) => {
      const rect = element.getBoundingClientRect();
      const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
      const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
      setCaptionLayerTransform({ xPercent, yPercent });
    },
    [setCaptionLayerTransform]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (captions.length === 0) return;
      draggingRef.current = true;
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      updatePositionFromPointer(event, target);

      const handleMove = (moveEvent: PointerEvent) => {
        if (draggingRef.current) updatePositionFromPointer(moveEvent, target);
      };
      const handleUp = () => {
        draggingRef.current = false;
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [captions.length, updatePositionFromPointer]
  );

  if (!showOverlay) return null;

  return (
    <div
      className="absolute inset-0"
      style={{ cursor: captions.length ? "grab" : "default" }}
      title="Drag to move the global caption layer"
      onPointerDown={handlePointerDown}
    >
      <CaptionRenderer
        captions={captions}
        currentTime={currentTime}
        fps={30}
        scale={0.55}
        transition
        styleConfig={captionStyleConfig}
      />
    </div>
  );
}
