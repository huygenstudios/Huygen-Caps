/* Editor Store — global editor state */

import { create } from "zustand";
import { DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG, normalizeCaptionStyleConfig } from "@/lib/captionStyleConfig";
import { getCaptionPreset } from "@/lib/captionStylePresets";
import { DEFAULT_CAPTION_CHUNKING_CONFIG } from "@/lib/captionUtils";
import { DEFAULT_EXPORT_SETTINGS, DEFAULT_SEQUENCE_SETTINGS, normalizeExportSettings, normalizeSequenceSettings } from "@/lib/editorModel";
import { recordProjectHistory } from "@/lib/projectHistory";
import {
  AlignedSegment,
  CaptionChunkingConfig,
  CaptionLayerTransform,
  CaptionStylePresetId,
  ColorMode,
  ExportSettings,
  CaptionStyleConfig,
  CaptionTheme,
  Language,
  MediaFile,
  RightPanelTab,
  SequenceSettings,
  ToolMode,
} from "@/lib/types";

interface EditorState {
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;

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
  applyCaptionStylePreset: (presetId: CaptionStylePresetId) => void;
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
  sequenceSettings: SequenceSettings;
  setSequenceSettings: (settings: Partial<SequenceSettings>) => void;
  exportSettings: ExportSettings;
  setExportSettings: (settings: Partial<ExportSettings>) => void;

  // Pipeline
  jobId: string | null;
  setJobId: (id: string | null) => void;
  pipelineStatus: string;
  pipelinePercent: number;
  setPipelineProgress: (status: string, percent: number) => void;

  // Panels
  mediaPanelTab: "project" | "effects" | "history";
  setMediaPanelTab: (tab: "project" | "effects" | "history") => void;
  rightPanelTab: RightPanelTab;
  setRightPanelTab: (tab: RightPanelTab) => void;

  // Export
  showExportModal: boolean;
  setShowExportModal: (show: boolean) => void;
  showSequenceSettings: boolean;
  setShowSequenceSettings: (show: boolean) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  colorMode: "dark",
  setColorMode: (mode) => set({ colorMode: mode }),

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
  setTheme: (theme) => {
    recordProjectHistory("Caption theme");
    set({ theme });
  },
  applyCaptionStylePreset: (presetId) =>
    set((state) => {
      recordProjectHistory("Caption style preset");
      const preset = getCaptionPreset(presetId);
      const captionStyleConfig = normalizeCaptionStyleConfig(preset.defaultStyleConfig);
      return {
        theme: presetId,
        captionStyleConfig,
        captionChunkingConfig: {
          ...state.captionChunkingConfig,
          ...preset.defaultChunkingConfig,
        },
        captionLayerTransform: {
          xPercent: captionStyleConfig.positionX,
          yPercent: captionStyleConfig.positionY,
          scale: captionStyleConfig.scale,
          rotation: captionStyleConfig.rotation,
          opacity: captionStyleConfig.opacity,
          anchor: "center",
        },
      };
    }),
  captionStyleConfig: DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG,
  setCaptionStyleConfig: (config) =>
    set((state) => {
      recordProjectHistory("Caption style", { debounceKey: "caption-style-config", debounceMs: 700 });
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
          scale: captionStyleConfig.scale,
          rotation: captionStyleConfig.rotation,
          opacity: captionStyleConfig.opacity,
        },
      };
    }),
  resetCaptionStyleConfig: () =>
    set(() => {
      recordProjectHistory("Reset caption style");
      return {
        captionStyleConfig: DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG,
        theme: "word_highlight_box",
        captionLayerTransform: {
          xPercent: DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG.positionX,
          yPercent: DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG.positionY,
          scale: DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG.scale,
          rotation: DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG.rotation,
          opacity: DEFAULT_WORD_HIGHLIGHT_BOX_CONFIG.opacity,
          anchor: "center",
        },
      };
    }),
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
    opacity: 1,
    anchor: "center",
  },
  setCaptionLayerTransform: (transform) =>
    set((state) => {
      recordProjectHistory("Caption transform", { debounceKey: "caption-layer-transform", debounceMs: 700 });
      const next = {
        ...state.captionLayerTransform,
        ...transform,
        xPercent: Math.min(100, Math.max(0, transform.xPercent ?? state.captionLayerTransform.xPercent)),
        yPercent: Math.min(100, Math.max(0, transform.yPercent ?? state.captionLayerTransform.yPercent)),
        scale: Math.min(3, Math.max(0, transform.scale ?? state.captionLayerTransform.scale)),
        rotation: Math.min(180, Math.max(-180, transform.rotation ?? state.captionLayerTransform.rotation)),
        opacity: Math.min(1, Math.max(0, transform.opacity ?? state.captionLayerTransform.opacity)),
      };
      return {
        captionLayerTransform: next,
        captionStyleConfig: normalizeCaptionStyleConfig({
          ...state.captionStyleConfig,
          positionX: next.xPercent,
          positionY: next.yPercent,
          scale: next.scale,
          rotation: next.rotation,
          opacity: next.opacity,
        }),
      };
    }),
  sequenceSettings: DEFAULT_SEQUENCE_SETTINGS,
  setSequenceSettings: (settings) =>
    set((state) => {
      recordProjectHistory("Sequence settings");
      const sequenceSettings = normalizeSequenceSettings({ ...state.sequenceSettings, ...settings });
      return {
        sequenceSettings,
        exportSettings: normalizeExportSettings(state.exportSettings, sequenceSettings),
      };
    }),
  exportSettings: DEFAULT_EXPORT_SETTINGS,
  setExportSettings: (settings) =>
    set((state) => {
      recordProjectHistory("Export settings", { debounceKey: "export-settings", debounceMs: 500 });
      return {
        exportSettings: normalizeExportSettings({ ...state.exportSettings, ...settings }, state.sequenceSettings),
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
  rightPanelTab: "effect-controls",
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

  showExportModal: false,
  setShowExportModal: (show) => set({ showExportModal: show }),
  showSequenceSettings: false,
  setShowSequenceSettings: (show) => set({ showSequenceSettings: show }),
}));
