/* Huygen Caps - caption-first editor shell */
/* Huygen Caps - caption-first editor shell */

"use client";

import React, { useEffect, useRef } from "react";

import EditorWorkspaceShell from "@/components/editor/EditorWorkspaceShell";
import ExportModal from "@/components/editor/ExportModal";
import JobStatusBanner from "@/components/editor/JobStatusBanner";
import SequenceSettingsModal from "@/components/editor/SequenceSettingsModal";
import Toolbar from "@/components/editor/Toolbar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useEditorStore } from "@/store/editorStore";
import "@/store/projectHistoryStore";
import { useTimelineStore } from "@/store/timelineStore";

export default function EditorApp() {
  useKeyboardShortcuts();
  const notifiedVideoRestoreKeysRef = useRef<Set<string> | null>(null);

  const initDefaultTracks = useTimelineStore((s) => s.initDefaultTracks);
  const tracks = useTimelineStore((s) => s.tracks);
  const ensureBaseVideoClip = useTimelineStore((s) => s.ensureBaseVideoClip);
  const colorMode = useEditorStore((s) => s.colorMode);
  const setColorMode = useEditorStore((s) => s.setColorMode);
  const mediaFiles = useEditorStore((s) => s.mediaFiles);
  const activeMediaId = useEditorStore((s) => s.activeMediaId);

  useEffect(() => {
    const tracks = useTimelineStore.getState().tracks;
    if (tracks.length === 0) initDefaultTracks();
  }, [initDefaultTracks]);

  useEffect(() => {
    if (tracks.length === 0) return;
    const activeVideo = mediaFiles.find((file) => file.id === activeMediaId && file.type === "video")
      || mediaFiles.find((file) => file.type === "video");
    if (!activeVideo) return;

    const hasVideoClip = tracks.some((track) =>
      track.visible && (track.clips || []).some((clip) => clip.type === "video" && clip.mediaId === activeVideo.id && clip.visible !== false)
    );
    if (!hasVideoClip) {
      if (!notifiedVideoRestoreKeysRef.current) {
        const storedKeys = window.sessionStorage.getItem("huygen-restored-video-notices");
        try {
          notifiedVideoRestoreKeysRef.current = new Set(storedKeys ? JSON.parse(storedKeys) as string[] : []);
        } catch {
          notifiedVideoRestoreKeysRef.current = new Set();
        }
      }
      const restoreKey = `${activeVideo.id}:${activeVideo.name}:${activeVideo.size}`;
      const shouldNotify = !notifiedVideoRestoreKeysRef.current.has(restoreKey);
      ensureBaseVideoClip(activeVideo, { notify: shouldNotify });
      if (shouldNotify) {
        notifiedVideoRestoreKeysRef.current.add(restoreKey);
        window.sessionStorage.setItem("huygen-restored-video-notices", JSON.stringify(Array.from(notifiedVideoRestoreKeysRef.current)));
      }
    }
  }, [activeMediaId, ensureBaseVideoClip, mediaFiles, tracks]);

  useEffect(() => {
    const stored = window.localStorage.getItem("huygen-caps-theme");
    if (stored === "dark" || stored === "light") {
      setColorMode(stored);
    } else {
      document.documentElement.dataset.theme = "dark";
    }
  }, [setColorMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = colorMode;
    window.localStorage.setItem("huygen-caps-theme", colorMode);
  }, [colorMode]);

  return (
    <div className="editor-shell flex h-[100dvh] w-screen flex-col overflow-hidden" style={{ background: "var(--bg-app)" }}>
      <Toolbar />
      <EditorWorkspaceShell />

      <ExportModal />
      <SequenceSettingsModal />
      <JobStatusBanner />
    </div>
  );
}
