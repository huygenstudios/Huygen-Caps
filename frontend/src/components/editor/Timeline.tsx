/* Timeline — main timeline panel with ruler, tracks, playhead */

"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";
import { Magnet, Plus, ZoomIn, ZoomOut, Trash2 } from "lucide-react";
import { useTimelineStore } from "@/store/timelineStore";
import { useCaptionStore } from "@/store/captionStore";
import { usePlaybackStore } from "@/store/playbackStore";
import { useEditorStore } from "@/store/editorStore";
import { useTimelineSync } from "@/hooks/useTimelineSync";
import { TRACK_HEADER_WIDTH } from "@/lib/timelineUtils";
import TimelineRuler from "./TimelineRuler";
import TimelineTrack from "./TimelineTrack";
import Playhead from "./Playhead";

export default function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    tracks,
    scrollLeft,
    pixelsPerSecond,
    setScrollLeft,
    snapEnabled,
    toggleSnap,
    zoomIn,
    zoomOut,
    addTrackByType,
    notice,
    clearNotice,
  } = useTimelineStore();

  const clearAll = useCaptionStore((s) => s.clearAll);
  const duration = usePlaybackStore((s) => s.duration);
  const mediaFiles = useEditorStore((s) => s.mediaFiles);
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  const { handleTimelineSeek } = useTimelineSync();

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(clearNotice, 3200);
    return () => window.clearTimeout(timer);
  }, [clearNotice, notice]);

  // Horizontal scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Wheel = zoom
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      } else {
        // Normal scroll = horizontal pan
        setScrollLeft(scrollLeft + e.deltaY);
      }
    },
    [scrollLeft, setScrollLeft, zoomIn, zoomOut]
  );

  // Click on ruler area to seek
  const handleRulerClick = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      handleTimelineSeek(e.clientX, rect.left);
    },
    [handleTimelineSeek]
  );

  const containerWidth = containerRef.current?.clientWidth || 800;
  const projectDuration = Math.max(
    30,
    duration,
    ...tracks.flatMap((track) => (track.clips || []).map((clip) => clip.end))
  );
  const maxScrollLeft = Math.max(
    0,
    projectDuration * pixelsPerSecond - (containerWidth - TRACK_HEADER_WIDTH)
  );
  const hasTimelineClips = tracks.some((track) => (track.clips || []).length > 0);
  const hasImportedMedia = mediaFiles.length > 0;

  return (
    <div className="panel flex flex-col h-full">
      {/* Timeline header */}
      <div className="panel-header justify-between">
        <span>Timeline</span>
        <div className="flex items-center gap-1">
          <button
            className="p-1 rounded hover:bg-white/10"
            onClick={toggleSnap}
            title={`Snap ${snapEnabled ? "ON" : "OFF"}`}
          >
            <Magnet
              size={12}
              style={{ color: snapEnabled ? "var(--accent)" : "var(--text-muted)" }}
            />
          </button>
          <button className="p-1 rounded hover:bg-white/10" onClick={zoomOut} title="Zoom Out (-)">
            <ZoomOut size={12} style={{ color: "var(--text-muted)" }} />
          </button>
          <button className="p-1 rounded hover:bg-white/10" onClick={zoomIn} title="Zoom In (+)">
            <ZoomIn size={12} style={{ color: "var(--text-muted)" }} />
          </button>
          <button
            className="p-1 rounded hover:bg-white/10"
            onClick={clearAll}
            title="Clear All Captions"
          >
            <Trash2 size={12} style={{ color: "var(--text-muted)" }} />
          </button>
          <div className="relative">
            <button
              className="btn-ghost flex items-center gap-1 px-2 py-1 text-[10px]"
              onClick={() => setLayerMenuOpen((open) => !open)}
              title="Add timeline layer"
            >
              <Plus size={12} />
              Layer
            </button>
            {layerMenuOpen && (
              <div className="menu-popover absolute right-0 top-7 z-[90] w-40 p-1">
                {[
                  ["video", "Add Video Layer"],
                  ["audio", "Add Audio Layer"],
                  ["caption", "Add Subtitle Layer"],
                  ["overlay", "Add Overlay Layer"],
                ].map(([type, label]) => (
                  <button
                    key={type}
                    className="menu-item text-[11px]"
                    onClick={() => {
                      addTrackByType(type as "video" | "audio" | "caption" | "overlay");
                      setLayerMenuOpen(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {notice && (
        <div className="editor-notice mx-2 mt-2 flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button className="text-xs font-bold" onClick={clearNotice}>
            Dismiss
          </button>
        </div>
      )}

      {/* Timeline body */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-auto"
        onWheel={handleWheel}
        data-timeline-area
      >
        {/* Ruler row */}
        <div className="sticky top-0 z-40 flex">
          {/* Track header spacer */}
          <div
            className="shrink-0"
            style={{
              width: TRACK_HEADER_WIDTH,
              background: "var(--bg-panel-dark)",
              borderRight: "1px solid var(--border)",
              borderBottom: "1px solid var(--border)",
              height: 24,
            }}
          />
          {/* Ruler */}
          <div className="flex-1 overflow-hidden cursor-pointer" onClick={handleRulerClick}>
            <TimelineRuler width={containerWidth - TRACK_HEADER_WIDTH} />
          </div>
        </div>

        {/* Tracks */}
        <div className="relative min-h-full">
          {tracks.map((track) => (
            <TimelineTrack key={track.id} track={track} />
          ))}

          {/* Playhead spans all tracks */}
          <Playhead />

          {/* Empty state */}
          {!hasTimelineClips && !hasImportedMedia && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center py-8">
              <p className="brutal-empty px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                Your video and captions will appear here.
              </p>
            </div>
          )}
        </div>
      </div>

      <div
        className="h-4 px-2 flex items-center"
        style={{ background: "var(--bg-panel-dark)", borderTop: "1px solid var(--border)" }}
      >
        <input
          type="range"
          min={0}
          max={Math.max(0, Math.round(maxScrollLeft))}
          value={Math.min(scrollLeft, maxScrollLeft)}
          onChange={(event) => setScrollLeft(Number(event.target.value))}
          className="w-full"
          aria-label="Timeline horizontal scroll"
        />
      </div>
    </div>
  );
}
