/* ExportModal - Huygen Caps export dialog */

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Film, Loader2, Save, X } from "lucide-react";
import { getExportJobStatus, resolveBackendUrl, startHeadlessExportJob } from "@/lib/api";
import { captionBelongsOnTrack, determineExportDuration, resolveExportDimensions, resolveExportFps } from "@/lib/editorModel";
import { applyCaptionTimingOffset, downloadFile } from "@/lib/captionUtils";
import { ExportFormat, ProjectData } from "@/lib/types";
import { useCaptionExport } from "@/hooks/useCaptionExport";
import { useCaptionStore } from "@/store/captionStore";
import { useEditorStore } from "@/store/editorStore";
import { useTimelineStore } from "@/store/timelineStore";

interface ExportOption {
  format: ExportFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const options: ExportOption[] = [
  {
    format: "mp4",
    label: "MP4",
    description: "Render with current export settings",
    icon: <Film size={19} />,
  },
  {
    format: "srt",
    label: "SRT Subtitles",
    description: "Standard subtitle sidecar",
    icon: <FileText size={19} />,
  },
  {
    format: "ass",
    label: "ASS Subtitles",
    description: "Styled subtitle sidecar",
    icon: <FileText size={19} />,
  },
  {
    format: "json",
    label: "Transcript JSON",
    description: "Caption and timing data",
    icon: <FileText size={19} />,
  },
  {
    format: "project",
    label: "Project File",
    description: "Save Huygen Caps project data",
    icon: <Save size={19} />,
  },
];

function apiResolutionLabel(width: number, height: number) {
  const maxEdge = Math.max(width, height);
  if (maxEdge <= 854) return "480p";
  if (maxEdge <= 1280) return "720p";
  return "1080p";
}

function qualityLabel(value: string) {
  if (value === "best") return "Best Quality";
  if (value === "low_bitrate") return "Low Bitrate";
  return value[0]?.toUpperCase() + value.slice(1);
}

function formatExportError(err: unknown) {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "Export failed";
  if (/\b502\b|bad gateway|backend is unreachable/i.test(raw)) {
    return "Backend export service became unreachable. Check Render logs, /health, and /health/export.";
  }
  const message = raw
    .replace(/^Headless export failed:\s*/i, "")
    .replace(/^Export failed during unexpected_error:\s*$/i, "Export failed during failed: backend returned an empty error. Check /api/health/export and the backend logs.")
    .trim();
  if (message.startsWith("<!DOCTYPE") || message.includes("<html")) {
    return "Export API returned an HTML page instead of JSON. Check that the editor is calling FastAPI, not the Next.js dev server.";
  }
  return message.length > 4500 ? `${message.slice(0, 4500)}...` : message;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function ExportModal() {
  const {
    showExportModal,
    setShowExportModal,
    language,
    theme,
    mediaFiles,
    jobId,
    captionStyleConfig,
    captionChunkingConfig,
    captionTimingConfig,
    captionLayerTransform,
    sequenceSettings,
    exportSettings,
    setExportSettings,
  } = useEditorStore();
  const allCaptions = useCaptionStore((s) => s.captions);
  const captionDocument = useCaptionStore((s) => s.captionDocument);
  const tracks = useTimelineStore((s) => s.tracks);
  const { exportSRT, exportASS } = useCaptionExport();
  const [exporting, setExporting] = useState(false);
  const [exportPercent, setExportPercent] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [exportError, setExportError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("");
  const pollCancelledRef = useRef(false);

  const visibleCaptionTracks = useMemo(
    () => tracks.filter((track) => (track.type === "caption" || track.type === "overlay") && track.visible),
    [tracks]
  );
  const captionsForExport = useMemo(() => {
    if (!exportSettings.visibleTracksOnly) return allCaptions;
    return allCaptions.filter((caption) =>
      visibleCaptionTracks.some((track) => captionBelongsOnTrack(caption, track, tracks))
    );
  }, [allCaptions, exportSettings.visibleTracksOnly, tracks, visibleCaptionTracks]);
  const canonicalCaptionDocument = useMemo(
    () => ({
      id: captionDocument?.id || "captions_1",
      name: captionDocument?.name || "Generated captions",
      sourceMediaId: captionDocument?.sourceMediaId || captionsForExport.find((caption) => caption.sourceMediaId)?.sourceMediaId,
      languageMode: captionDocument?.languageMode || language,
      transcript: captionDocument?.transcript || {
        segments: captionsForExport.map((caption) => ({
          id: caption.id,
          start: caption.start,
          end: caption.end,
          text: caption.text,
          words: caption.words,
        })),
      },
      originalAlignedWords: captionDocument?.originalAlignedWords || captionsForExport.flatMap((caption) => caption.words || []),
      chunks: captionsForExport,
      style: captionStyleConfig,
      chunkingConfig: captionChunkingConfig,
      timingConfig: captionTimingConfig,
      coverageReport: captionDocument?.coverageReport,
    }),
    [
      captionChunkingConfig,
      captionDocument,
      captionStyleConfig,
      captionTimingConfig,
      captionsForExport,
      language,
    ]
  );

  useEffect(() => {
    if (!showExportModal) {
      pollCancelledRef.current = true;
      if (downloadUrl.startsWith("blob:")) URL.revokeObjectURL(downloadUrl);
      setDownloadUrl("");
      setDownloadName("");
    }
  }, [downloadUrl, showExportModal]);

  if (!showExportModal) return null;

  const timelineClips = tracks.flatMap((track) => track.clips || []);
  const timelineDuration = Math.max(
    mediaFiles[0]?.duration || 0,
    ...timelineClips.map((clip) => clip.end),
    ...allCaptions.map((caption) => caption.end),
    0.1
  );
  const exportDimensions = resolveExportDimensions(exportSettings, sequenceSettings);
  const exportFps = resolveExportFps(exportSettings, sequenceSettings);
  const durationInfo = determineExportDuration({
    exportSettings,
    sequenceSettings,
    mediaFiles,
    tracks,
    captions: captionsForExport,
    playbackDuration: timelineDuration,
  });
  const includeAudioForExport =
    exportSettings.includeAudio &&
    tracks.some((track) => track.type === "audio" && track.visible && !track.muted);
  const exportDuration = durationInfo.duration;
  const handleExport = async (format: ExportFormat) => {
    setExportError("");
    setExportStatus("");
    setExportPercent(0);
    if (downloadUrl.startsWith("blob:")) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl("");
    setDownloadName("");
    setExporting(true);

    switch (format) {
      case "srt":
        exportSRT();
        setExporting(false);
        setShowExportModal(false);
        return;
      case "ass":
        exportASS();
        setExporting(false);
        setShowExportModal(false);
        return;
      case "json":
        downloadFile(
          JSON.stringify(
            {
              product: "Huygen Caps",
              languageMode: language,
              segments: captionsForExport,
              captionDocument: canonicalCaptionDocument,
              styleConfig: captionStyleConfig,
              chunkingConfig: captionChunkingConfig,
              timingConfig: captionTimingConfig,
              layerTransform: captionLayerTransform,
              sequenceSettings,
              exportSettings,
            },
            null,
            2
          ),
          "huygen_caps_transcript.json",
          "application/json"
        );
        setExporting(false);
        setShowExportModal(false);
        return;
      case "project": {
        const project: ProjectData = {
          version: "6.0",
          timeline: {
            duration: timelineDuration,
            tracks,
            clips: timelineClips,
          },
          captions: captionsForExport,
          captionDocuments: [canonicalCaptionDocument],
          settings: {
            language,
            theme,
            captionStyleConfig,
              captionChunkingConfig,
              captionTimingConfig,
              captionLayerTransform,
            sequenceSettings,
            exportSettings,
          },
        };
        downloadFile(JSON.stringify(project, null, 2), "huygen_caps_project.json", "application/json");
        setExporting(false);
        setShowExportModal(false);
        return;
      }
      case "mp4":
        break;
    }

    if (!jobId) {
      setExportError("Generate captions once before MP4 export so Huygen Caps has a render job.");
      setExporting(false);
      return;
    }

    if (exportSettings.mode === "captions_only" && captionsForExport.length === 0) {
      setExportError("No captions available for captions-only export.");
      setExporting(false);
      return;
    }

    if (exportDuration <= 0) {
      setExportError("Export failed because project duration could not be determined. Please check media metadata, timeline clips, captions, or set a custom export duration.");
      setExporting(false);
      return;
    }

    try {
      setExportSettings({ format: "mp4" });
      setExportStatus("Preparing Huygen render...");
      pollCancelledRef.current = false;

      const payloadCaptions = exportSettings.burnCaptions
        ? applyCaptionTimingOffset(captionsForExport, captionTimingConfig.globalOffsetSeconds)
        : [];
      console.info("huygen_export_request", {
        jobId,
        mode: exportSettings.mode,
        width: exportDimensions.width,
        height: exportDimensions.height,
        fps: exportFps,
        duration: exportDuration,
        durationSource: durationInfo.source,
        captions: payloadCaptions.length,
        exportGlobalOffsetSeconds: captionTimingConfig.globalOffsetSeconds,
        visibleTracks: visibleCaptionTracks.length,
        sourceMedia: mediaFiles.length,
      });
      const started = await startHeadlessExportJob(
        jobId,
        JSON.stringify(payloadCaptions),
        theme,
        apiResolutionLabel(exportDimensions.width, exportDimensions.height),
        JSON.stringify(captionStyleConfig),
        {
          width: exportDimensions.width,
          height: exportDimensions.height,
          fps: exportFps,
          includeAudio: includeAudioForExport,
          quality: exportSettings.quality,
          bitrate: exportSettings.bitrate,
          customBitrateMbps: exportSettings.customBitrateMbps,
          exportMode: exportSettings.mode,
          backgroundColor: exportSettings.mode === "captions_only" ? exportSettings.backgroundColor : sequenceSettings.backgroundColor,
          duration: exportDuration,
          durationSource: durationInfo.source,
          visibleTracksCount: visibleCaptionTracks.length,
          sourceMediaCount: mediaFiles.length,
          captionChunksCount: payloadCaptions.length,
          hardwareAcceleration: exportSettings.hardwareAcceleration,
        }
      );
      setExportStatus(started.message || "Export started...");

      let missedPolls = 0;
      while (!pollCancelledRef.current) {
        await wait(1500);
        try {
          const status = await getExportJobStatus(started.statusUrl || started.jobId);
          missedPolls = 0;
          const nextPercent = Math.max(0, Math.min(100, status.progress || 0));
          setExportPercent(nextPercent);
          setExportStatus(status.message || status.stage || status.status);

          if (status.status === "completed") {
            if (!status.downloadUrl) {
              throw new Error("Export completed but did not return a download URL.");
            }
            setDownloadUrl(resolveBackendUrl(status.downloadUrl));
            setDownloadName(status.filename || `huygen_caps_${exportSettings.mode}_${exportDimensions.width}x${exportDimensions.height}_${exportFps}fps.mp4`);
            setExportStatus("Export complete. MP4 is ready to download.");
            setExportPercent(100);
            setExporting(false);
            return;
          }

          if (status.status === "failed") {
            pollCancelledRef.current = true;
            setExportError(formatExportError(`Export failed during ${status.stage}: ${status.error || status.message || "backend export failed"}`));
            setExportStatus("Export failed");
            setExportPercent(-1);
            setExporting(false);
            return;
          }
        } catch (pollError) {
          missedPolls += 1;
          if (missedPolls >= 5) {
            throw pollError;
          }
          setExportStatus("Waiting for backend export status...");
        }
      }
    } catch (err: unknown) {
      pollCancelledRef.current = true;
      setExportError(formatExportError(err));
      setExportStatus("Export failed");
      setExportPercent(-1);
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={() => !exporting && setShowExportModal(false)} />

      <div className="modal-shell relative w-[min(760px,calc(100vw-32px))] overflow-hidden">
        <div className="panel-header justify-between">
          <div className="flex items-center gap-2">
            <Download size={16} style={{ color: "var(--accent)" }} />
            <span>Export</span>
          </div>
          <button className="icon-button" disabled={exporting} onClick={() => setShowExportModal(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-[1fr_220px]">
          <div className="grid gap-2">
            {options.map((option) => {
              const disabled = exporting || (option.format !== "mp4" && captionsForExport.length === 0);
              return (
                <button
                  key={option.format}
                  className="export-option"
                  disabled={disabled}
                  onClick={() => handleExport(option.format)}
                >
                  <span className="export-option-icon">{option.icon}</span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                      {option.label}
                    </span>
                    <span className="block text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid content-start gap-3">
            <div className="brutal-box grid gap-2 p-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <div className="font-bold uppercase" style={{ color: "var(--text-primary)" }}>
                {exportSettings.mode === "captions_only" ? "Captions Only" : "Full Video"}
              </div>
              <div className="flex justify-between">
                <span>Size</span>
                <span className="font-mono">{exportDimensions.width}x{exportDimensions.height}</span>
              </div>
              <div className="flex justify-between">
                <span>FPS</span>
                <span className="font-mono">{exportFps}</span>
              </div>
              <div className="flex justify-between">
                <span>Quality</span>
                <span>{qualityLabel(exportSettings.quality)}</span>
              </div>
              <div className="flex justify-between">
                <span>Audio</span>
                <span>{includeAudioForExport ? "On" : "Off"}</span>
              </div>
              <div className="flex justify-between">
                <span>Captions</span>
                <span>{captionsForExport.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Duration</span>
                <span>{exportDuration.toFixed(2)}s / {durationInfo.source}</span>
              </div>
            </div>

            {exportSettings.mode === "captions_only" && (
              <div className="brutal-box grid gap-2 p-3">
                <label className="grid gap-1 text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>
                  <span>Solid background</span>
                  <input
                    className="control-input h-9"
                    type="color"
                    value={exportSettings.backgroundColor}
                    onChange={(event) => setExportSettings({ backgroundColor: event.target.value })}
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="border-t p-4" style={{ borderColor: "var(--border)" }}>
          {downloadUrl ? (
            <div className="editor-notice flex items-center justify-between gap-3">
              <span>{exportStatus || "Export complete."}</span>
              <a className="btn-primary" href={downloadUrl} download={downloadName}>
                Download MP4
              </a>
            </div>
          ) : exportError ? (
            <div className="editor-notice error flex items-center justify-between gap-3">
              <span className="max-h-40 min-w-0 overflow-auto whitespace-pre-wrap break-words">{exportError}</span>
              <button onClick={() => setExportError("")}>Clear</button>
            </div>
          ) : exporting ? (
            <div className="grid gap-2">
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-primary)" }}>
                <Loader2 size={14} className="animate-spin" style={{ color: "var(--accent)" }} />
                <span>{exportStatus || "Exporting..."}</span>
                {exportPercent > 0 && exportPercent <= 100 && <span>{exportPercent}%</span>}
              </div>
              {exportPercent > 0 && exportPercent <= 100 && (
                <div className="h-2 overflow-hidden border" style={{ background: "var(--bg-panel-dark)", borderColor: "var(--border)" }}>
                  <div className="h-full transition-all duration-500" style={{ width: `${exportPercent}%`, background: "var(--accent)" }} />
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span>{captionsForExport.length} caption{captionsForExport.length !== 1 ? "s" : ""} ready</span>
              <span>{exportSettings.visibleTracksOnly ? "visible tracks only" : "all tracks"} / {exportSettings.burnCaptions ? "burn captions" : "no burned captions"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
