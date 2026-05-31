/* Editor Store — global editor state */

import { create } from "zustand";
import { DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG, normalizeCaptionStyleConfig } from "@/lib/captionStyleConfig";
import { DEFAULT_CAPTION_CHUNKING_CONFIG } from "@/lib/captionUtils";
import {
  AlignedSegment,
  CaptionChunkingConfig,
  CaptionLayerTransform,
  CaptionStyleConfig,
  CaptionTheme,
  Language,
  MediaFile,
  ToolMode,
} from "@/lib/types";

interface EditorState {
  // Tool
  activeTool: ToolMode;
  setActiveTool: (tool: ToolMode) => void;

  // Media
  mediaFiles: MediaFile[];
  activeMediaId: string | null;
  addMedia: (file: MediaFile) => void;
  removeMedia: (id: string) => void;
  setActiveMedia: (id: string | null) => void;

  // Settings
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: CaptionTheme;
  setTheme: (theme: CaptionTheme) => void;
  captionStyleConfig: CaptionStyleConfig;
  setCaptionStyleConfig: (config: Partial<CaptionStyleConfig>) => void;
  resetCaptionStyleConfig: () => void;
  savedCaptionPresets: CaptionStyleConfig[];
  saveCaptionPreset: (name?: string) => void;
  captionChunkingConfig: CaptionChunkingConfig;
  setCaptionChunkingConfig: (config: Partial<CaptionChunkingConfig>) => void;
  transcriptSegments: AlignedSegment[];
  setTranscriptSegments: (segments: AlignedSegment[]) => void;
  captionLayerTransform: CaptionLayerTransform;
  setCaptionLayerTransform: (transform: Partial<CaptionLayerTransform>) => void;

  // Pipeline
  jobId: string | null;
  setJobId: (id: string | null) => void;
  pipelineStatus: string;
  pipelinePercent: number;
  setPipelineProgress: (status: string, percent: number) => void;

  // Panels
  mediaPanelTab: "project" | "effects" | "history";
  setMediaPanelTab: (tab: "project" | "effects" | "history") => void;

  // Export
  showExportModal: boolean;
  setShowExportModal: (show: boolean) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  activeTool: "selection",
  setActiveTool: (tool) => set({ activeTool: tool }),

  mediaFiles: [],
  activeMediaId: null,
  addMedia: (file) =>
    set((state) => ({
      mediaFiles: [...state.mediaFiles, file],
      activeMediaId: state.activeMediaId || file.id,
    })),
  removeMedia: (id) =>
    set((state) => ({
      mediaFiles: state.mediaFiles.filter((f) => f.id !== id),
      activeMediaId: state.activeMediaId === id ? null : state.activeMediaId,
    })),
  setActiveMedia: (id) => set({ activeMediaId: id }),

  language: "auto_mixed_indian",
  setLanguage: (lang) => set({ language: lang }),
  theme: "word_highlight_box",
  setTheme: (theme) => set({ theme }),
  captionStyleConfig: DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG,
  setCaptionStyleConfig: (config) =>
    set((state) => {
      const captionStyleConfig = normalizeCaptionStyleConfig({
        ...state.captionStyleConfig,
        ...config,
      });
      return {
        captionStyleConfig,
        captionLayerTransform: {
          ...state.captionLayerTransform,
          xPercent: captionStyleConfig.positionX,
          yPercent: captionStyleConfig.positionY,
        },
      };
    }),
  resetCaptionStyleConfig: () =>
    set({ captionStyleConfig: DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG, theme: "word_highlight_box" }),
  savedCaptionPresets: [],
  saveCaptionPreset: (name) =>
    set((state) => ({
      savedCaptionPresets: [
        ...state.savedCaptionPresets,
        normalizeCaptionStyleConfig({
          ...state.captionStyleConfig,
          presetName: name?.trim() || state.captionStyleConfig.presetName || "Custom Word Highlight Box",
        }),
      ].slice(-12),
    })),
  captionChunkingConfig: DEFAULT_CAPTION_CHUNKING_CONFIG,
  setCaptionChunkingConfig: (config) =>
    set((state) => ({
      captionChunkingConfig: {
        ...state.captionChunkingConfig,
        ...config,
      },
    })),
  transcriptSegments: [],
  setTranscriptSegments: (segments) => set({ transcriptSegments: segments }),
  captionLayerTransform: {
    xPercent: 50,
    yPercent: 78,
    scale: 1,
    rotation: 0,
    anchor: "center",
  },
  setCaptionLayerTransform: (transform) =>
    set((state) => {
      const next = {
        ...state.captionLayerTransform,
        ...transform,
        xPercent: Math.min(100, Math.max(0, transform.xPercent ?? state.captionLayerTransform.xPercent)),
        yPercent: Math.min(100, Math.max(0, transform.yPercent ?? state.captionLayerTransform.yPercent)),
        scale: Math.min(3, Math.max(0.2, transform.scale ?? state.captionLayerTransform.scale)),
        rotation: Math.min(180, Math.max(-180, transform.rotation ?? state.captionLayerTransform.rotation)),
      };
      return {
        captionLayerTransform: next,
        captionStyleConfig: normalizeCaptionStyleConfig({
          ...state.captionStyleConfig,
          positionX: next.xPercent,
          positionY: next.yPercent,
        }),
      };
    }),

  jobId: null,
  setJobId: (id) => set({ jobId: id }),
  pipelineStatus: "",
  pipelinePercent: 0,
  setPipelineProgress: (status, percent) =>
    set({ pipelineStatus: status, pipelinePercent: percent }),

  mediaPanelTab: "project",
  setMediaPanelTab: (tab) => set({ mediaPanelTab: tab }),

  showExportModal: false,
  setShowExportModal: (show) => set({ showExportModal: show }),
}));
