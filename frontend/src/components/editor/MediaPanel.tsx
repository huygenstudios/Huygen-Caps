/* MediaPanel - Project files, caption styles, and history */
/* eslint-disable @next/next/no-img-element */

"use client";

import React, { useCallback, useEffect } from "react";
import { Film, FolderOpen, Image as ImageIcon, Music, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { useCaptionStore } from "@/store/captionStore";
import { usePlaybackStore } from "@/store/playbackStore";
import { useProjectHistoryStore } from "@/store/projectHistoryStore";
import { useTimelineStore } from "@/store/timelineStore";
import { MediaFile } from "@/lib/types";
import { CAPTION_PRESET_LIST } from "@/lib/captionStylePresets";

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function iconForType(type: string) {
  if (type === "video") return <Film size={14} />;
  if (type === "audio") return <Music size={14} />;
  return <ImageIcon size={14} />;
}

export default function MediaPanel() {
  const {
    mediaFiles,
    activeMediaId,
    addMedia,
    removeMedia,
    setActiveMedia,
    mediaPanelTab,
    setMediaPanelTab,
    theme,
    applyCaptionStylePreset,
    setRightPanelTab,
  } = useEditorStore();
  const setThemeForAll = useCaptionStore((s) => s.setThemeForAll);
  const captions = useCaptionStore((s) => s.captions);
  const setCaptions = useCaptionStore((s) => s.setCaptions);
  const setDuration = usePlaybackStore((s) => s.setDuration);
  const initDefaultTracks = useTimelineStore((s) => s.initDefaultTracks);
  const addClip = useTimelineStore((s) => s.addClip);
  const removeClipsByMediaId = useTimelineStore((s) => s.removeClipsByMediaId);
  const historyPast = useProjectHistoryStore((s) => s.past);
  const historyFuture = useProjectHistoryStore((s) => s.future);

  const addBaseVideoIfNeeded = useCallback(
    (mediaFile: MediaFile) => {
      if (mediaFile.type !== "video") return;

      if (useTimelineStore.getState().tracks.length === 0) {
        initDefaultTracks();
      }

      const latestTracks = useTimelineStore.getState().tracks;
      const hasVideoClip = latestTracks.some((track) => (track.clips || []).some((clip) => clip.type === "video"));
      const hasLinkedAudioClip = latestTracks.some((track) =>
        track.type === "audio" && (track.clips || []).some((clip) => clip.mediaId === mediaFile.id)
      );

      setDuration(mediaFile.duration);

      if (!hasVideoClip) {
        addClip("v1", {
          type: "video",
          mediaId: mediaFile.id,
          start: 0,
          end: mediaFile.duration || 5,
          transform: { xPercent: 50, yPercent: 50, scale: 1, rotation: 0, opacity: 1 },
        });
      }

      if (!hasLinkedAudioClip && latestTracks.some((track) => track.id === "a1" && !track.locked)) {
        addClip("a1", {
          type: "audio",
          mediaId: mediaFile.id,
          start: 0,
          end: mediaFile.duration || 5,
          visible: true,
          volume: 1,
          muted: false,
        });
      }
    },
    [addClip, initDefaultTracks, setDuration]
  );

  const importFile = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith("video") ? "video" : file.type.startsWith("audio") ? "audio" : "image";
      const mediaFile: MediaFile = {
        id: `m_${Date.now()}`,
        name: file.name,
        type: type as MediaFile["type"],
        size: file.size,
        duration: type === "image" ? 5 : 0,
        url,
        file,
      };

      if (type === "video" || type === "audio") {
        const el = document.createElement(type);
        el.src = url;
        el.onloadedmetadata = () => {
          mediaFile.duration = el.duration;
          if (type === "video") {
            mediaFile.resolution = {
              width: (el as HTMLVideoElement).videoWidth,
              height: (el as HTMLVideoElement).videoHeight,
            };
          }
          addMedia(mediaFile);
          addBaseVideoIfNeeded(mediaFile);
        };
        return;
      }

      addMedia(mediaFile);
    },
    [addBaseVideoIfNeeded, addMedia]
  );

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*,audio/*,image/png,image/jpeg,image/webp";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) importFile(file);
    };
    input.click();
  }, [importFile]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) importFile(file);
    },
    [importFile]
  );

  useEffect(() => {
    const openImport = () => handleImport();
    window.addEventListener("huygen-caps-open-import", openImport);
    return () => {
      window.removeEventListener("huygen-caps-open-import", openImport);
    };
  }, [handleImport]);

  return (
    <div className="panel flex flex-col h-full">
      <div className="panel-header">
        {(["project", "effects", "history"] as const).map((tab) => {
          const count = tab === "project" ? mediaFiles.length : tab === "effects" ? CAPTION_PRESET_LIST.length : historyPast.length;
          return (
          <div
            key={tab}
            className={`panel-header-tab flex items-center gap-2 ${mediaPanelTab === tab ? "active" : ""}`}
            onClick={() => setMediaPanelTab(tab)}
          >
            <span>{tab}</span>
            <span className="count-badge">{count}</span>
          </div>
        );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {mediaPanelTab === "project" && (
          <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} className="min-h-full">
            {mediaFiles.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-2 p-2 rounded cursor-pointer transition-colors mb-1"
                draggable
                onClick={() => setActiveMedia(f.id)}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-huygen-caps-media", f.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                style={{
                  background: activeMediaId === f.id ? "rgba(245, 56, 56, 0.16)" : "transparent",
                  border: activeMediaId === f.id ? "2px solid var(--accent)" : "2px solid transparent",
                }}
              >
                <span style={{ color: "var(--accent)" }}>{iconForType(f.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
                    {f.name}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {f.duration > 0 && `${formatDuration(f.duration)} - `}
                    {formatSize(f.size)}
                    {f.resolution && ` - ${f.resolution.width}x${f.resolution.height}`}
                  </div>
                </div>
                <button
                  className="p-1 rounded hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    const ok = window.confirm(
                      "Delete media asset? Existing generated captions will be kept. Timeline clips using this media may be removed."
                    );
                    if (!ok) return;
                    removeMedia(f.id);
                    removeClipsByMediaId(f.id);
                    setCaptions(captions.map((caption) => (
                      caption.sourceMediaId === f.id ? { ...caption, sourceMediaId: undefined } : caption
                    )));
                  }}
                  title="Delete media"
                >
                  <Trash2 size={12} style={{ color: "var(--text-muted)" }} />
                </button>
              </div>
            ))}

            <button
              className="flex items-center gap-2 w-full p-2 mt-2 rounded text-xs transition-colors"
              style={{ border: "1px dashed var(--border)", color: "var(--text-muted)" }}
              onClick={handleImport}
            >
              <Plus size={14} />
              Import Media
            </button>

            {mediaFiles.length === 0 && (
              <div className="brutal-empty flex flex-col items-center justify-center py-8 text-center">
                <img className="empty-logo" src="/brand/huygen-logo.png" alt="Huygen Caps" />
                <FolderOpen size={26} style={{ color: "var(--accent)" }} className="mb-2" />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Import media to start editing.
                  <br />
                  Drag files here or click Import Media.
                </p>
              </div>
            )}
          </div>
        )}

        {mediaPanelTab === "effects" && (
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
              <Sparkles size={12} />
              Caption Styles ({CAPTION_PRESET_LIST.length})
            </div>
            <div className="grid grid-cols-1 gap-2">
              {CAPTION_PRESET_LIST.map((t) => (
                <button
                  key={t.id}
                  className={`style-preview-card ${theme === t.id ? "active" : ""}`}
                  onClick={() => {
                    applyCaptionStylePreset(t.id);
                    setThemeForAll(t.id);
                    setRightPanelTab("caption-style");
                  }}
                  title={t.description}
                >
                  <span
                    className="text-xs text-center leading-tight truncate"
                    style={{
                      color: t.id === "attention_punch" ? "#FFD43B" : t.id === "mrbeast_style" ? "#00FF00" : "#fff",
                      fontWeight: 900,
                      fontFamily: t.id === "modern_minimalist_lockup" ? "Inter, Helvetica, Arial, sans-serif" : undefined,
                      textTransform: t.id === "mrbeast_style" || t.id === "attention_punch" ? "uppercase" : "none",
                    }}
                  >
                    {t.previewText}
                  </span>
                  <span className="mt-1 text-[9px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>
                    {t.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mediaPanelTab === "history" && (
          <div className="space-y-2">
            <div className="brutal-box p-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <div className="font-bold uppercase" style={{ color: "var(--text-primary)" }}>Project History</div>
              <div>{historyPast.length} undo step{historyPast.length === 1 ? "" : "s"}</div>
              <div>{historyFuture.length} redo step{historyFuture.length === 1 ? "" : "s"}</div>
            </div>
            {historyPast.slice(-8).reverse().map((entry, index) => (
              <div key={`${entry.label}-${index}`} className="brutal-box p-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                {entry.label || "Project edit"}
              </div>
            ))}
            {historyPast.length === 0 && (
              <p className="py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>No history yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
