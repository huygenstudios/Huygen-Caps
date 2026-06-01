/* CaptionEditorPanel — Right panel for caption list, generation, editing */

/* eslint-disable @next/next/no-img-element */

"use client";

import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  Languages,
  Wand2,
  Plus,
  Trash2,
  Scissors,
  Palette,
  Search,
  Replace,
  Clock3,
  AlertTriangle,
  RotateCcw,
  ChevronsLeft,
  ChevronsRight,
  Merge,
} from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { useCaptionStore } from "@/store/captionStore";
import { usePlaybackStore } from "@/store/playbackStore";
import { useTimelineStore } from "@/store/timelineStore";
import { useCaptionExport } from "@/hooks/useCaptionExport";
import { useWebSocket } from "@/hooks/useWebSocket";
import { getHealth, uploadVideo, getJob } from "@/lib/api";
import {
  applyEditedCaptionText,
  applyManualCaptionTiming,
  inferWordTimingSource,
  segmentsToCaptions,
  formatTime,
  parseTime,
  shiftCaptionTiming,
  validateCaptionTiming,
} from "@/lib/captionUtils";
import { defaultCaptionTrackId, isCaptionLocked } from "@/lib/editorModel";
import { Language, CaptionTheme, CAPTION_THEMES } from "@/lib/types";
import { CAPTION_PRESET_LIST } from "@/lib/captionStylePresets";

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "auto_mixed_indian", label: "Auto Mixed Indian" },
  { value: "english", label: "English" },
  { value: "hinglish", label: "Hinglish" },
  { value: "telgish", label: "Telgish / Teluglish" },
];

function formatGenerateError(message: string) {
  if (!message) return "";
  if (message.includes("<!DOCTYPE html") || message.includes("<html")) {
    if (message.includes("This page could not be found") || message.includes("404")) {
      return "Backend API returned a Next.js 404 page. The editor is calling the frontend server instead of FastAPI. Refresh the page and make sure the backend is running on http://127.0.0.1:8000.";
    }
    return "Backend returned an HTML error page instead of JSON. Check the backend terminal and /api/health.";
  }
  return message.length > 500 ? `${message.slice(0, 500)}...` : message;
}

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
  const { captions, selectedIds, selectCaption, updateCaption, deleteCaption, addCaption, splitCaption, mergeCaptions, setCaptions } =
    useCaptionStore();
  const setThemeForAll = useCaptionStore((s) => s.setThemeForAll);
  const { currentTime } = usePlaybackStore();
  const tracks = useTimelineStore((s) => s.tracks);
  const { exportSRT, exportASS } = useCaptionExport();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [stylePickerForId, setStylePickerForId] = useState<string | null>(null);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editingTimeField, setEditingTimeField] = useState<"start" | "end">("start");
  const [captionSearch, setCaptionSearch] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [globalOffset, setGlobalOffset] = useState(0);
  const [selectedOffset, setSelectedOffset] = useState(0);
  const globalOffsetRef = useRef(0);
  const selectedOffsetRef = useRef(0);

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
    setPipelineProgress("Checking backend...", 2);

    try {
      const health = await getHealth();
      if (health.dependencies?.ffmpeg !== true) {
        throw new Error("Backend is reachable, but FFmpeg is not available. Install FFmpeg or set FFMPEG_PATH on the server.");
      }
      if (health.dependencies?.ffprobe !== true) {
        throw new Error("Backend is reachable, but FFprobe is not available. Install FFmpeg/FFprobe on the server.");
      }

      setPipelineProgress("Uploading...", 5);
      const result = await uploadVideo(activeMedia.file, language);
      setJobId(result.job_id);

      // Poll for completion
      let pollFailures = 0;
      const pollInterval = window.setInterval(async () => {
        try {
          const job = await getJob(result.job_id);
          pollFailures = 0;
          if (job.status === "completed") {
            window.clearInterval(pollInterval);
            setPipelineProgress("Done", 100);

            const sourceSegments = job.transcript?.segments?.length ? job.transcript.segments : job.segments || [];
            if (sourceSegments.length) {
              setTranscriptSegments(sourceSegments);
              const newCaptions = segmentsToCaptions(
                sourceSegments,
                job.languageMode || language,
                useEditorStore.getState().theme,
                useEditorStore.getState().captionChunkingConfig
              ).map((caption) => ({
                ...caption,
                trackId: defaultCaptionTrackId(useTimelineStore.getState().tracks),
                sourceMediaId: activeMedia.id,
              }));
              setCaptions(newCaptions);
            }
            setIsGenerating(false);
          } else if (job.status === "failed") {
            window.clearInterval(pollInterval);
            const message = job.error || "Caption generation failed.";
            setPipelineProgress("Failed", -1);
            setGenerateError(message);
            setIsGenerating(false);
          } else {
            setPipelineProgress(job.status || "Processing", Math.max(0, job.progress || 0));
          }
        } catch (err) {
          pollFailures += 1;
          const msg = err instanceof Error ? err.message : "Failed to read job status.";
          setGenerateError(msg);
          if (pollFailures >= 3) {
            window.clearInterval(pollInterval);
            setPipelineProgress("Error", -1);
            setIsGenerating(false);
          }
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
    ).map((caption) => ({
      ...caption,
      trackId: defaultCaptionTrackId(tracks),
      sourceMediaId: activeMediaId || undefined,
    }));
    setCaptions(rebuilt);
    setGenerateError("");
  }, [activeMediaId, captionChunkingConfig, language, setCaptions, tracks, transcriptSegments]);

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
          ).map((caption) => ({
            ...caption,
            trackId: defaultCaptionTrackId(tracks),
            sourceMediaId: activeMediaId || undefined,
          }))
        );
        setGenerateError("");
      }
    },
    [activeMediaId, captionChunkingConfig, language, setCaptionChunkingConfig, setCaptions, tracks, transcriptSegments]
  );

  const handleAddCaption = useCallback(() => {
    addCaption({
      start: currentTime,
      end: currentTime + 3,
      text: "New caption",
      lang: language,
      theme: useEditorStore.getState().theme,
      trackId: defaultCaptionTrackId(tracks),
      sourceMediaId: activeMediaId || undefined,
    });
  }, [activeMediaId, currentTime, addCaption, language, tracks]);

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

  const sortedCaptions = useMemo(() => [...captions].sort((a, b) => a.start - b.start), [captions]);
  const selectedCaptionId = useMemo(() => Array.from(selectedIds)[0] || null, [selectedIds]);
  const selectedCaption = useMemo(
    () => (selectedCaptionId ? captions.find((caption) => caption.id === selectedCaptionId) || null : null),
    [captions, selectedCaptionId]
  );
  const filteredCaptions = useMemo(() => {
    const query = captionSearch.trim().toLowerCase();
    if (!query) return sortedCaptions;
    return sortedCaptions.filter((caption) => caption.text.toLowerCase().includes(query));
  }, [captionSearch, sortedCaptions]);

  const THEME_NAMES: { id: CaptionTheme; label: string }[] = CAPTION_PRESET_LIST.map((preset) => ({
    id: preset.id,
    label: preset.name.replace(" Style", "").replace(" Cinematic", "").replace("Modern Minimalist ", ""),
  }));

  const applyTextEdit = useCallback(
    (captionId: string, nextText: string) => {
      const caption = captions.find((candidate) => candidate.id === captionId);
      if (!caption || isCaptionLocked(caption, tracks)) return;
      updateCaption(captionId, applyEditedCaptionText(caption, nextText));
    },
    [captions, tracks, updateCaption]
  );

  const resetCaptionText = useCallback(
    (captionId: string) => {
      const caption = captions.find((candidate) => candidate.id === captionId);
      if (!caption || isCaptionLocked(caption, tracks)) return;
      const original =
        caption.originalText ||
        caption.words?.map((word) => word.originalWord || word.word).join(" ") ||
        caption.text;
      updateCaption(captionId, applyEditedCaptionText(caption, original));
    },
    [captions, tracks, updateCaption]
  );

  const applyGlobalOffset = useCallback(
    (nextOffset: number) => {
      const delta = nextOffset - globalOffsetRef.current;
      globalOffsetRef.current = nextOffset;
      setGlobalOffset(nextOffset);
      if (Math.abs(delta) < 0.0001) return;
      setCaptions(captions.map((caption) => shiftCaptionTiming(caption, delta)));
    },
    [captions, setCaptions]
  );

  const applySelectedOffset = useCallback(
    (nextOffset: number) => {
      const delta = nextOffset - selectedOffsetRef.current;
      selectedOffsetRef.current = nextOffset;
      setSelectedOffset(nextOffset);
      if (!selectedCaption || Math.abs(delta) < 0.0001) return;
      updateCaption(selectedCaption.id, shiftCaptionTiming(selectedCaption, delta));
    },
    [selectedCaption, updateCaption]
  );

  const nudgeSelectedCaption = useCallback(
    (delta: number) => {
      if (!selectedCaption || isCaptionLocked(selectedCaption, tracks)) return;
      updateCaption(selectedCaption.id, shiftCaptionTiming(selectedCaption, delta));
      const next = Math.max(-0.5, Math.min(0.5, selectedOffsetRef.current + delta));
      selectedOffsetRef.current = next;
      setSelectedOffset(next);
    },
    [selectedCaption, tracks, updateCaption]
  );

  const updateSelectedTiming = useCallback(
    (patch: Partial<{ start: number; end: number }>) => {
      if (!selectedCaption || isCaptionLocked(selectedCaption, tracks)) return;
      const next = applyManualCaptionTiming(
        selectedCaption,
        patch.start ?? selectedCaption.start,
        patch.end ?? selectedCaption.end
      );
      updateCaption(selectedCaption.id, next);
    },
    [selectedCaption, tracks, updateCaption]
  );

  const resetTimingAdjustments = useCallback(() => {
    globalOffsetRef.current = 0;
    selectedOffsetRef.current = 0;
    setGlobalOffset(0);
    setSelectedOffset(0);
    rebuildCaptions();
  }, [rebuildCaptions]);

  const replaceInCaptions = useCallback(() => {
    const query = captionSearch.trim();
    if (!query) return;
    const search = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    captions.forEach((caption) => {
      if (!search.test(caption.text) || isCaptionLocked(caption, tracks)) return;
      search.lastIndex = 0;
      updateCaption(caption.id, applyEditedCaptionText(caption, caption.text.replace(search, replaceText)));
    });
  }, [captionSearch, captions, replaceText, tracks, updateCaption]);

  const mergeWithNext = useCallback(
    (captionId: string) => {
      const index = sortedCaptions.findIndex((caption) => caption.id === captionId);
      const next = sortedCaptions[index + 1];
      if (!next) return;
      mergeCaptions([captionId, next.id]);
    },
    [mergeCaptions, sortedCaptions]
  );

  const handleApplyThemeToCaption = useCallback(
    (captionId: string, newTheme: CaptionTheme) => {
      const caption = captions.find((candidate) => candidate.id === captionId);
      if (caption && isCaptionLocked(caption, tracks)) return;
      updateCaption(captionId, { theme: newTheme, style: CAPTION_THEMES[newTheme] });
      setStylePickerForId(null);
    },
    [captions, tracks, updateCaption]
  );

  const handleApplyThemeToAll = useCallback(
    (newTheme: CaptionTheme) => {
      setThemeForAll(newTheme);
    },
    [setThemeForAll]
  );

  const deleteSelectedUnlocked = useCallback(() => {
    Array.from(selectedIds).forEach((captionId) => {
      const caption = captions.find((candidate) => candidate.id === captionId);
      if (!caption || isCaptionLocked(caption, tracks)) return;
      deleteCaption(captionId);
    });
  }, [captions, deleteCaption, selectedIds, tracks]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="min-h-0 flex-1 overflow-y-scroll"
        style={{ scrollbarGutter: "stable", overscrollBehavior: "contain" }}
      >
      {/* Controls */}
      <div className="p-2 space-y-2" style={{ borderBottom: "1px solid var(--border)" }}>
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
            style={{ color: "var(--error-text)", background: "var(--error-bg)", border: "1px solid var(--error-border)" }}
          >
            {formatGenerateError(generateError)}
          </div>
        )}

        <div className="grid gap-2 rounded p-2" style={{ background: "var(--bg-panel-dark)" }}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>
              <Clock3 size={11} />
              Timing & Sync
            </span>
            <button className="btn-ghost text-[10px]" onClick={resetTimingAdjustments} title="Rebuild timing from the saved transcript">
              Reset Timing
            </button>
          </div>

          <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span>Global caption offset {globalOffset.toFixed(2)}s</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={globalOffset}
              onChange={(e) => applyGlobalOffset(Number(e.target.value))}
              className="accent-[var(--accent)]"
            />
          </label>

          <label className="grid gap-1 text-[10px]" style={{ color: selectedCaption ? "var(--text-muted)" : "var(--text-disabled)" }}>
            <span>Selected caption offset {selectedOffset.toFixed(2)}s</span>
            <input
              type="range"
              min={-0.5}
              max={0.5}
              step={0.01}
              value={selectedOffset}
              disabled={!selectedCaption}
              onChange={(e) => applySelectedOffset(Number(e.target.value))}
              className="accent-[var(--accent)] disabled:opacity-50"
            />
          </label>

          <div className="grid grid-cols-4 gap-1">
            {[-0.1, -0.05, 0.05, 0.1].map((delta) => (
              <button
                key={delta}
                className="btn-ghost flex items-center justify-center gap-1 text-[10px]"
                disabled={!selectedCaption}
                onClick={() => nudgeSelectedCaption(delta)}
                title={`Nudge selected caption ${delta > 0 ? "right" : "left"} by ${Math.abs(delta).toFixed(2)}s`}
              >
                {delta < 0 ? <ChevronsLeft size={10} /> : <ChevronsRight size={10} />}
                {delta > 0 ? "+" : ""}
                {delta.toFixed(2)}
              </button>
            ))}
          </div>

          {selectedCaption && (
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                <span>Selected start</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={selectedCaption.start}
                  onChange={(e) => updateSelectedTiming({ start: Number(e.target.value) })}
                  className="rounded border-0 px-2 py-1 text-xs outline-none"
                  style={{ background: "var(--bg-app)", color: "var(--text-primary)" }}
                />
              </label>
              <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                <span>Selected end</span>
                <input
                  type="number"
                  min={selectedCaption.start + 0.08}
                  step={0.01}
                  value={selectedCaption.end}
                  onChange={(e) => updateSelectedTiming({ end: Number(e.target.value) })}
                  className="rounded border-0 px-2 py-1 text-xs outline-none"
                  style={{ background: "var(--bg-app)", color: "var(--text-primary)" }}
                />
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>Word sensitivity {(captionChunkingConfig.wordTimingSensitivity ?? 1).toFixed(2)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={captionChunkingConfig.wordTimingSensitivity ?? 1}
                onChange={(e) => updateChunking({ wordTimingSensitivity: Number(e.target.value) })}
                className="accent-[var(--accent)]"
              />
            </label>
            <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>Min word {(captionChunkingConfig.minWordDuration ?? 0.06).toFixed(2)}s</span>
              <input
                type="range"
                min={0.03}
                max={0.2}
                step={0.01}
                value={captionChunkingConfig.minWordDuration ?? 0.06}
                onChange={(e) => updateChunking({ minWordDuration: Number(e.target.value) })}
                className="accent-[var(--accent)]"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>Max hold {(captionChunkingConfig.maxHoldAfterWord ?? 0.12).toFixed(2)}s</span>
              <input
                type="range"
                min={0}
                max={0.3}
                step={0.01}
                value={captionChunkingConfig.maxHoldAfterWord ?? 0.12}
                onChange={(e) => updateChunking({ maxHoldAfterWord: Number(e.target.value) })}
                className="accent-[var(--accent)]"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>Snap to waveform peaks</span>
              <input
                type="checkbox"
                checked={Boolean(captionChunkingConfig.snapToWaveformPeaks)}
                onChange={(e) => updateChunking({ snapToWaveformPeaks: e.target.checked })}
                className="accent-[var(--accent)]"
                title="Waveform data is visual-only right now; manual offsets still apply."
              />
            </label>
          </div>

          <button id="rebuild-timing-btn" className="btn-primary text-[10px]" onClick={rebuildCaptions}>
            Rebuild Timing
          </button>
        </div>

        <div className="grid gap-2 rounded p-2" style={{ background: "var(--bg-panel-dark)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>
              Caption Chunking
            </span>
            <button id="rebuild-captions-btn" className="btn-ghost text-[10px]" onClick={rebuildCaptions}>
              Rebuild Captions
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>Target words: {captionChunkingConfig.targetWordsPerCaption}</span>
              <input
                type="range"
                min={2}
                max={6}
                value={captionChunkingConfig.targetWordsPerCaption}
                onChange={(e) => updateChunking({ targetWordsPerCaption: Number(e.target.value) })}
                className="accent-[var(--accent)]"
              />
            </label>
            <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>Max words: {captionChunkingConfig.maxWordsPerCaption}</span>
              <input
                type="range"
                min={2}
                max={8}
                value={captionChunkingConfig.maxWordsPerCaption}
                onChange={(e) => updateChunking({ maxWordsPerCaption: Number(e.target.value) })}
                className="accent-[var(--accent)]"
              />
            </label>
          </div>
          <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span>Min words per caption: {captionChunkingConfig.minWordsPerCaption}</span>
            <input
              type="range"
              min={1}
              max={4}
              value={captionChunkingConfig.minWordsPerCaption}
              onChange={(e) => updateChunking({ minWordsPerCaption: Number(e.target.value) })}
              className="accent-[var(--accent)]"
            />
          </label>
          <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span>Max characters: {captionChunkingConfig.maxCharsPerCaption}</span>
            <input
              type="range"
              min={12}
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
              <span>Min duration {captionChunkingConfig.minCaptionDuration.toFixed(2)}s</span>
              <input
                type="range"
                min={0.1}
                max={1.2}
                step={0.05}
                value={captionChunkingConfig.minCaptionDuration}
                onChange={(e) => updateChunking({ minCaptionDuration: Number(e.target.value) })}
                className="accent-[var(--accent)]"
              />
            </label>
            <label className="grid gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>Max duration {captionChunkingConfig.maxCaptionDuration.toFixed(2)}s</span>
              <input
                type="range"
                min={0.5}
                max={4}
                step={0.05}
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
                max={0.35}
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

      {/* Subtitle editor */}
      <div className="p-1">
        <div className="px-1 py-1 text-[10px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>
          Caption Editor
        </div>
        <div className="mb-2 grid gap-1 px-1">
          <label className="flex items-center gap-1 rounded px-2 py-1" style={{ background: "var(--bg-panel-dark)" }}>
            <Search size={11} style={{ color: "var(--text-muted)" }} />
            <input
              value={captionSearch}
              onChange={(e) => setCaptionSearch(e.target.value)}
              placeholder="Search captions"
              className="w-full border-0 bg-transparent text-xs outline-none"
              style={{ color: "var(--text-primary)" }}
            />
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-1">
            <input
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace with"
              className="rounded border-0 px-2 py-1 text-xs outline-none"
              style={{ background: "var(--bg-panel-dark)", color: "var(--text-primary)" }}
            />
            <button className="btn-ghost flex items-center gap-1 text-[10px]" onClick={replaceInCaptions} disabled={!captionSearch.trim()}>
              <Replace size={11} />
              Replace
            </button>
          </div>
        </div>
        {sortedCaptions.length === 0 ? (
          <div className="brutal-empty flex flex-col items-center justify-center py-8 text-center">
            <img className="empty-logo" src="/brand/huygen-logo.png" alt="Huygen Caps" />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Generate captions to edit subtitle timing.
              <br />
              Or add a caption manually.
            </p>
          </div>
        ) : (
          filteredCaptions.map((caption) => {
            const locked = isCaptionLocked(caption, tracks);
            const rowIndex = sortedCaptions.findIndex((candidate) => candidate.id === caption.id) + 1;
            const timingWarning = validateCaptionTiming(caption);
            const timingSource = caption.words?.[0] ? inferWordTimingSource(caption.words[0]) : caption.timingNeedsReview ? "estimated" : "manual";
            return (
            <div
              key={caption.id}
              className="p-2 mb-1 rounded cursor-pointer transition-colors group"
              style={{
                background: selectedIds.has(caption.id)
                  ? "rgba(245, 56, 56, 0.16)"
                  : "var(--bg-panel-dark)",
                border: selectedIds.has(caption.id)
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
              }}
              onClick={() => {
                selectCaption(caption.id);
                usePlaybackStore.getState().setCurrentTime(caption.start);
              }}
            >
              {/* Timestamp — clickable for inline edit */}
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[10px] font-semibold tabular-nums" style={{ color: "var(--text-muted)" }}>
                  #{rowIndex}
                </span>
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
                    className={`font-mono text-[10px] ${locked ? "" : "cursor-text hover:underline"}`}
                    style={{ color: locked ? "var(--text-muted)" : "var(--accent)" }}
                    onClick={(e) => {
                      if (!locked) handleTimeClick(caption.id, "start", e);
                    }}
                    title={locked ? "Track locked" : "Click to edit start time"}
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
                    className={`font-mono text-[10px] ${locked ? "" : "cursor-text hover:underline"}`}
                    style={{ color: locked ? "var(--text-muted)" : "var(--accent)" }}
                    onClick={(e) => {
                      if (!locked) handleTimeClick(caption.id, "end", e);
                    }}
                    title={locked ? "Track locked" : "Click to edit end time"}
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
                    color: "#ffffff",
                  }}
                >
                  {caption.lang}
                </span>
                <span
                  className="text-[8px] px-1 py-0.5 rounded uppercase"
                  style={{
                    background:
                      timingSource === "provider" || timingSource === "aligned"
                        ? "rgba(34,197,94,0.16)"
                        : timingSource === "manual"
                        ? "rgba(168,85,247,0.16)"
                        : "rgba(255,212,59,0.16)",
                    color:
                      timingSource === "provider" || timingSource === "aligned"
                        ? "#22c55e"
                        : timingSource === "manual"
                        ? "var(--accent)"
                        : "#ffd36b",
                  }}
                  title={`Timing source: ${timingSource}`}
                >
                  {timingSource}
                </span>
                {timingWarning && <AlertTriangle size={11} style={{ color: "#ffd36b" }} aria-label={timingWarning} />}
              </div>

              {/* Text */}
              <textarea
                key={`${caption.id}-${caption.text}`}
                className="min-h-16 w-full resize-y rounded border-0 px-2 py-1 text-xs leading-relaxed outline-none disabled:opacity-60"
                style={{
                  background: "var(--bg-app)",
                  color: "var(--text-primary)",
                }}
                defaultValue={caption.text}
                disabled={locked}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => applyTextEdit(caption.id, e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    applyTextEdit(caption.id, e.currentTarget.value);
                    e.currentTarget.blur();
                  }
                  if (e.key === "Escape") {
                    e.currentTarget.value = caption.text;
                    e.currentTarget.blur();
                  }
                }}
              />

              {locked && (
                <div className="mt-1 text-[9px]" style={{ color: "#ffd36b" }}>
                  Track locked
                </div>
              )}

              {(caption.timingNeedsReview || timingWarning) && (
                <div className="mt-1 text-[9px]" style={{ color: "#ffd36b" }}>
                  {timingWarning || "Edited text may need timing review for exact word highlighting."}
                </div>
              )}

              {/* Actions (visible on hover) */}
              <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="p-0.5 rounded hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (locked) return;
                    resetCaptionText(caption.id);
                  }}
                  title="Reset to original transcript text"
                >
                  <RotateCcw size={10} style={{ color: "var(--text-muted)" }} />
                </button>
                <button
                  className="p-0.5 rounded hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (locked) return;
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
                    if (locked) return;
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
                    if (locked) return;
                    mergeWithNext(caption.id);
                  }}
                  title="Merge with next caption"
                >
                  <Merge size={10} style={{ color: "var(--text-muted)" }} />
                </button>
                <button
                  className="p-0.5 rounded hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (locked) return;
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
          );
          })
        )}
      </div>
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
          <button className="btn-ghost flex items-center gap-1" onClick={deleteSelectedUnlocked}>
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
