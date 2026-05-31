/* CaptionEditorPanel — Right panel for caption list, generation, editing */

"use client";

import React, { useState, useCallback } from "react";
import {
  Languages,
  Wand2,
  Plus,
  Trash2,
  Scissors,
  Palette,
} from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { useCaptionStore } from "@/store/captionStore";
import { usePlaybackStore } from "@/store/playbackStore";
import { useCaptionExport } from "@/hooks/useCaptionExport";
import { useWebSocket } from "@/hooks/useWebSocket";
import { uploadVideo, getJob } from "@/lib/api";
import { segmentsToCaptions, formatTime, parseTime } from "@/lib/captionUtils";
import { Language, CaptionTheme, CAPTION_THEMES } from "@/lib/types";
import CaptionStylePanel from "./CaptionStylePanel";

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "auto_mixed_indian", label: "Auto Mixed Indian" },
  { value: "english", label: "English" },
  { value: "hinglish", label: "Hinglish" },
  { value: "telgish", label: "Telgish / Teluglish" },
];

export default function CaptionEditorPanel() {
  const {
    language,
    setLanguage,
    mediaFiles,
    activeMediaId,
    pipelineStatus,
    pipelinePercent,
    setJobId,
    setPipelineProgress,
    captionChunkingConfig,
    setCaptionChunkingConfig,
    transcriptSegments,
    setTranscriptSegments,
  } =
    useEditorStore();
  const { captions, selectedIds, editingId, selectCaption, setEditingId, updateCaption, deleteCaption, deleteSelected, addCaption, splitCaption, setCaptions } =
    useCaptionStore();
  const { currentTime } = usePlaybackStore();
  const { exportSRT, exportASS } = useCaptionExport();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [stylePickerForId, setStylePickerForId] = useState<string | null>(null);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editingTimeField, setEditingTimeField] = useState<"start" | "end">("start");

  useWebSocket();

  const activeMedia = mediaFiles.find((f) => f.id === activeMediaId);

  const handleGenerate = useCallback(async () => {
    if (!activeMedia || isGenerating) return;
    if (activeMedia.type !== "video") {
      setGenerateError("Upload an MP4 or MOV video before generating captions.");
      return;
    }

    const lowerName = activeMedia.name.toLowerCase();
    if (!lowerName.endsWith(".mp4") && !lowerName.endsWith(".mov") && !lowerName.endsWith(".m4v")) {
      setGenerateError("Only MP4 and MOV uploads are supported for burned captions.");
      return;
    }

    setIsGenerating(true);
    setGenerateError("");
    setPipelineProgress("Uploading...", 5);

    try {
      const result = await uploadVideo(activeMedia.file, language);
      setJobId(result.job_id);

      // Poll for completion
      const pollInterval = setInterval(async () => {
        try {
          const job = await getJob(result.job_id);
          if (job.status === "completed") {
            clearInterval(pollInterval);
            setPipelineProgress("Done", 100);

            const sourceSegments = job.transcript?.segments?.length ? job.transcript.segments : job.segments || [];
            if (sourceSegments.length) {
              setTranscriptSegments(sourceSegments);
              const newCaptions = segmentsToCaptions(
                sourceSegments,
                job.languageMode || language,
                useEditorStore.getState().theme,
                useEditorStore.getState().captionChunkingConfig
              );
              setCaptions(newCaptions);
            }
            setIsGenerating(false);
          } else if (job.status === "failed") {
            clearInterval(pollInterval);
            const message = job.error || "Caption generation failed.";
            setPipelineProgress("Failed", -1);
            setGenerateError(message);
            setIsGenerating(false);
          } else {
            setPipelineProgress(job.status || "Processing", Math.max(0, job.progress || 0));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to read job status.";
          setGenerateError(msg);
        }
      }, 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      setPipelineProgress("Error", -1);
      setGenerateError(msg);
      setIsGenerating(false);
    }
  }, [activeMedia, isGenerating, language, setJobId, setPipelineProgress, setCaptions, setTranscriptSegments]);

  const rebuildCaptions = useCallback(() => {
    const sourceSegments = transcriptSegments.length ? transcriptSegments : [];
    if (!sourceSegments.length) {
      setGenerateError("Generate captions first before rebuilding chunks.");
      return;
    }
    const rebuilt = segmentsToCaptions(
      sourceSegments,
      language,
      useEditorStore.getState().theme,
      captionChunkingConfig
    );
    setCaptions(rebuilt);
    setGenerateError("");
  }, [captionChunkingConfig, language, setCaptions, transcriptSegments]);

  const updateChunking = useCallback(
    (patch: Partial<typeof captionChunkingConfig>) => {
      const nextConfig = { ...captionChunkingConfig, ...patch };
      setCaptionChunkingConfig(patch);
      if (transcriptSegments.length) {
        setCaptions(
          segmentsToCaptions(
            transcriptSegments,
            language,
            useEditorStore.getState().theme,
            nextConfig
          )
        );
        setGenerateError("");
      }
    },
    [captionChunkingConfig, language, setCaptionChunkingConfig, setCaptions, transcriptSegments]
  );

  const handleAddCaption = useCallback(() => {
    addCaption({
      start: currentTime,
      end: currentTime + 3,
      text: "New caption",
      lang: language,
      theme: useEditorStore.getState().theme,
    });
  }, [currentTime, addCaption, language]);

  const handleSplit = useCallback(
    (id: string) => {
      splitCaption(id, currentTime);
    },
    [currentTime, splitCaption]
  );

  // ── Inline time editing ──
  const handleTimeClick = useCallback((captionId: string, field: "start" | "end", e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTimeId(captionId);
    setEditingTimeField(field);
  }, []);

  const handleTimeBlur = useCallback((captionId: string, field: "start" | "end", value: string) => {
    const parsed = parseTime(value);
    if (parsed !== null) {
      updateCaption(captionId, { [field]: parsed });
    }
    setEditingTimeId(null);
  }, [updateCaption]);

  const handleTimeKeyDown = useCallback((captionId: string, field: "start" | "end", e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const parsed = parseTime(e.currentTarget.value);
      if (parsed !== null) {
        updateCaption(captionId, { [field]: parsed });
      }
      setEditingTimeId(null);
    }
    if (e.key === "Escape") {
      setEditingTimeId(null);
    }
  }, [updateCaption]);

  const sortedCaptions = [...captions].sort((a, b) => a.start - b.start);

  const THEME_NAMES: { id: CaptionTheme; label: string }[] = [
    { id: "word_highlight_box", label: "Box" },
    { id: "viral_word_highlight", label: "Word" },
    { id: "minimal", label: "Minimal" },
    { id: "viral_shorts", label: "Viral" },
    { id: "cinematic", label: "Cinema" },
    { id: "kalakar_fire", label: "Fire" },
    { id: "karaoke_neon", label: "Neon" },
    { id: "dramatic", label: "Drama" },
    { id: "glassmorphism", label: "Glass" },
    { id: "retro_vhs", label: "VHS" },
    { id: "neon_glow", label: "Glow" },
    { id: "typewriter", label: "Type" },
    { id: "comic_pop", label: "Comic" },
    { id: "elegant_serif", label: "Serif" },
    { id: "gradient_wave", label: "Gradient" },
    { id: "outline_bold", label: "Outline" },
    { id: "shadow_3d", label: "3D" },
    { id: "highlight_box", label: "Highlight" },
  ];

  const handleApplyThemeToCaption = useCallback(
    (captionId: string, newTheme: CaptionTheme) => {
      updateCaption(captionId, { theme: newTheme, style: CAPTION_THEMES[newTheme] });
      setStylePickerForId(null);
    },
    [updateCaption]
  );

  const handleApplyThemeToAll = useCallback(
    (newTheme: CaptionTheme) => {
      captions.forEach((c) => {
        updateCaption(c.id, { theme: newTheme, style: CAPTION_THEMES[newTheme] });
      });
    },
    [captions, updateCaption]
  );

  return (
    <div className="panel flex flex-col h-full">
      {/* Header */}
      <div className="panel-header">
        <span>Caption Editor</span>
      </div>

      {/* Controls */}
      <div className="p-2 space-y-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        {/* Language selector */}
        <div className="flex items-center gap-2">
          <Languages size={14} style={{ color: "var(--text-muted)" }} />
          <select
            className="flex-1 text-xs px-2 py-1 rounded border-0 outline-none cursor-pointer"
            style={{ background: "var(--bg-panel-dark)", color: "var(--text-primary)" }}
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* Generate button */}
        <button
          id="generate-captions-btn"
          className="btn-primary w-full flex items-center justify-center gap-2"
          onClick={handleGenerate}
          disabled={!activeMedia || isGenerating}
        >
          <Wand2 size={14} />
          {isGenerating ? "Generating..." : "Generate Captions"}
        </button>

        {/* Progress bar */}
        {pipelinePercent > 0 && pipelinePercent < 100 && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>{pipelineStatus}</span>
              <span>{pipelinePercent}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-panel-dark)" }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pipelinePercent}%`,
                  background: "var(--accent)",
                }}
              />
            </div>
          </div>
        )}

        {generateError && (
          <div
            className="text-[11px] leading-snug rounded px-2 py-1.5"
            style={{ color: "#ffb4b4", background: "rgba(255, 77, 77, 0.12)", border: "1px solid rgba(255, 77, 77, 0.25)" }}
          >
            {generateError}
          </div>
        )}

        <div className="grid gap-2 rounded p-2" style={{ background: "var(--bg-panel-dark)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>
              Caption Chunking
            </span>
            <button className="btn-ghost text-[10px]" onClick={rebuildCaptions}>
              Rebuild Captions
            </button>
          </div>
          <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span>Max words per caption: {captionChunkingConfig.maxWordsPerCaption}</span>
            <input
              type="range"
              min={2}
              max={8}
              value={captionChunkingConfig.maxWordsPerCaption}
              onChange={(e) => updateChunking({ maxWordsPerCaption: Number(e.target.value) })}
              className="accent-[var(--accent)]"
            />
          </label>
          <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span>Max characters: {captionChunkingConfig.maxCharsPerCaption}</span>
            <input
              type="range"
              min={24}
              max={48}
              value={captionChunkingConfig.maxCharsPerCaption}
              onChange={(e) => updateChunking({ maxCharsPerCaption: Number(e.target.value) })}
              className="accent-[var(--accent)]"
            />
          </label>
          <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span>Target reading speed: {captionChunkingConfig.targetReadingSpeedCps} cps</span>
            <input
              type="range"
              min={12}
              max={24}
              value={captionChunkingConfig.targetReadingSpeedCps}
              onChange={(e) => updateChunking({ targetReadingSpeedCps: Number(e.target.value) })}
              className="accent-[var(--accent)]"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>Min duration {captionChunkingConfig.minCaptionDuration.toFixed(1)}s</span>
              <input
                type="range"
                min={0.4}
                max={1.6}
                step={0.1}
                value={captionChunkingConfig.minCaptionDuration}
                onChange={(e) => updateChunking({ minCaptionDuration: Number(e.target.value) })}
                className="accent-[var(--accent)]"
              />
            </label>
            <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>Max duration {captionChunkingConfig.maxCaptionDuration.toFixed(1)}s</span>
              <input
                type="range"
                min={1.4}
                max={5}
                step={0.1}
                value={captionChunkingConfig.maxCaptionDuration}
                onChange={(e) => updateChunking({ maxCaptionDuration: Number(e.target.value) })}
                className="accent-[var(--accent)]"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>Pause split {captionChunkingConfig.pauseSplitThreshold.toFixed(2)}s</span>
              <input
                type="range"
                min={0.15}
                max={1}
                step={0.05}
                value={captionChunkingConfig.pauseSplitThreshold}
                onChange={(e) => updateChunking({ pauseSplitThreshold: Number(e.target.value) })}
                className="accent-[var(--accent)]"
              />
            </label>
            <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>Merge gap {captionChunkingConfig.mergeSmallGapThreshold.toFixed(2)}s</span>
              <input
                type="range"
                min={0}
                max={0.4}
                step={0.02}
                value={captionChunkingConfig.mergeSmallGapThreshold}
                onChange={(e) => updateChunking({ mergeSmallGapThreshold: Number(e.target.value) })}
                className="accent-[var(--accent)]"
              />
            </label>
          </div>
          <label className="flex items-center justify-between gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span>Avoid single-word captions</span>
            <input
              type="checkbox"
              checked={captionChunkingConfig.avoidSingleWordCaptions}
              onChange={(e) => updateChunking({ avoidSingleWordCaptions: e.target.checked })}
              className="accent-[var(--accent)]"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span>Balance line length</span>
            <input
              type="checkbox"
              checked={captionChunkingConfig.balanceLineLength}
              onChange={(e) => updateChunking({ balanceLineLength: e.target.checked })}
              className="accent-[var(--accent)]"
            />
          </label>
        </div>
      </div>

      <CaptionStylePanel />

      {/* Caption list */}
      <div className="flex-1 overflow-y-auto p-1">
        {sortedCaptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              No captions yet.
              <br />
              Generate or add manually.
            </p>
          </div>
        ) : (
          sortedCaptions.map((caption) => (
            <div
              key={caption.id}
              className="p-2 mb-1 rounded cursor-pointer transition-colors group"
              style={{
                background: selectedIds.has(caption.id)
                  ? "rgba(77, 159, 255, 0.15)"
                  : "var(--bg-panel-dark)",
                border: selectedIds.has(caption.id)
                  ? "1px solid var(--accent)"
                  : "1px solid transparent",
              }}
              onClick={() => selectCaption(caption.id)}
            >
              {/* Timestamp — clickable for inline edit */}
              <div className="flex items-center gap-1 mb-1">
                {editingTimeId === caption.id && editingTimeField === "start" ? (
                  <input
                    className="font-mono text-[10px] w-16 px-1 py-0 rounded border-0 outline-none"
                    style={{ background: "var(--bg-app)", color: "var(--accent)" }}
                    defaultValue={formatTime(caption.start)}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => handleTimeBlur(caption.id, "start", e.target.value)}
                    onKeyDown={(e) => handleTimeKeyDown(caption.id, "start", e)}
                  />
                ) : (
                  <span
                    className="font-mono text-[10px] cursor-text hover:underline"
                    style={{ color: "var(--accent)" }}
                    onClick={(e) => handleTimeClick(caption.id, "start", e)}
                    title="Click to edit start time"
                  >
                    {formatTime(caption.start)}
                  </span>
                )}
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  →
                </span>
                {editingTimeId === caption.id && editingTimeField === "end" ? (
                  <input
                    className="font-mono text-[10px] w-16 px-1 py-0 rounded border-0 outline-none"
                    style={{ background: "var(--bg-app)", color: "var(--accent)" }}
                    defaultValue={formatTime(caption.end)}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => handleTimeBlur(caption.id, "end", e.target.value)}
                    onKeyDown={(e) => handleTimeKeyDown(caption.id, "end", e)}
                  />
                ) : (
                  <span
                    className="font-mono text-[10px] cursor-text hover:underline"
                    style={{ color: "var(--accent)" }}
                    onClick={(e) => handleTimeClick(caption.id, "end", e)}
                    title="Click to edit end time"
                  >
                    {formatTime(caption.end)}
                  </span>
                )}
                <span
                  className="text-[8px] px-1 py-0.5 rounded ml-auto uppercase"
                  style={{
                    background:
                      caption.lang === "english"
                        ? "var(--caption-en)"
                        : caption.lang === "hinglish"
                        ? "var(--caption-hing)"
                        : "var(--caption-tel)",
                    color: "var(--text-primary)",
                  }}
                >
                  {caption.lang}
                </span>
              </div>

              {/* Text */}
              {editingId === caption.id ? (
                <input
                  className="w-full text-xs px-1 py-0.5 rounded border-0 outline-none"
                  style={{
                    background: "var(--bg-app)",
                    color: "var(--text-primary)",
                  }}
                  defaultValue={caption.text}
                  autoFocus
                  onBlur={(e) => {
                    updateCaption(caption.id, { text: e.target.value });
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      updateCaption(caption.id, {
                        text: (e.target as HTMLInputElement).value,
                      });
                      setEditingId(null);
                    }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <div
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--text-primary)" }}
                  onDoubleClick={() => setEditingId(caption.id)}
                >
                  {caption.text}
                </div>
              )}

              {/* Actions (visible on hover) */}
              <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="p-0.5 rounded hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(caption.id);
                  }}
                  title="Edit"
                >
                  <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                    Edit
                  </span>
                </button>
                <button
                  className="p-0.5 rounded hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setStylePickerForId(stylePickerForId === caption.id ? null : caption.id);
                  }}
                  title="Change style"
                >
                  <Palette size={10} style={{ color: "var(--text-muted)" }} />
                </button>
                <button
                  className="p-0.5 rounded hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSplit(caption.id);
                  }}
                  title="Split at playhead"
                >
                  <Scissors size={10} style={{ color: "var(--text-muted)" }} />
                </button>
                <button
                  className="p-0.5 rounded hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCaption(caption.id);
                  }}
                  title="Delete"
                >
                  <Trash2 size={10} style={{ color: "var(--text-muted)" }} />
                </button>
              </div>

              {/* Per-caption style picker dropdown */}
              {stylePickerForId === caption.id && (
                <div
                  className="mt-1 p-1.5 rounded grid grid-cols-4 gap-1"
                  style={{ background: "var(--bg-app)", border: "1px solid var(--border)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {THEME_NAMES.map((t) => {
                    const s = CAPTION_THEMES[t.id];
                    return (
                      <button
                        key={t.id}
                        className="px-1 py-1 rounded text-[8px] text-center transition-all"
                        style={{
                          background: caption.theme === t.id ? "var(--accent)" : "var(--bg-panel-dark)",
                          color: caption.theme === t.id ? "#fff" : s?.color || "var(--text-muted)",
                          fontWeight: s?.bold ? 700 : 400,
                          border: "1px solid var(--border)",
                        }}
                        onClick={() => handleApplyThemeToCaption(caption.id, t.id)}
                        title={t.label}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Bottom toolbar */}
      <div
        className="flex items-center gap-1 px-2 py-1.5 shrink-0"
        style={{ borderTop: "1px solid var(--border)", background: "var(--bg-panel-dark)" }}
      >
        <button className="btn-ghost flex items-center gap-1" onClick={handleAddCaption}>
          <Plus size={12} /> Add
        </button>

        {selectedIds.size > 0 && (
          <button className="btn-ghost flex items-center gap-1" onClick={deleteSelected}>
            <Trash2 size={12} /> Delete
          </button>
        )}

        {captions.length > 0 && (
          <button
            className="btn-ghost flex items-center gap-1"
            onClick={() => handleApplyThemeToAll(useEditorStore.getState().theme)}
            title="Apply current theme to all captions"
          >
            <Palette size={12} /> Apply All
          </button>
        )}

        <div className="flex-1" />

        <button className="btn-ghost" onClick={exportSRT} title="Export SRT">
          SRT
        </button>
        <button className="btn-ghost" onClick={exportASS} title="Export ASS">
          ASS
        </button>
      </div>
    </div>
  );
}

