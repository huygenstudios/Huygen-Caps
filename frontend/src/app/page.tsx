/* Huygen Caps - Main Editor Page
   5-Panel Premiere Pro Layout using react-resizable-panels
   
   ┌─────────────────────────────────────────────────────────────┐
   │ Toolbar                                                     │
   ├──────────┬──────────────────────────┬───────────────────────┤
   │ Media    │ Program Monitor          │ Caption Editor        │
   │ Panel    │                          │ Panel                 │
   ├──────────┴──────────────────────────┴───────────────────────┤
   │ Timeline                                                    │
   └─────────────────────────────────────────────────────────────┘
*/

"use client";

import React, { useEffect } from "react";
import {
  Panel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";

import Toolbar from "@/components/editor/Toolbar";
import MediaPanel from "@/components/editor/MediaPanel";
import ProgramMonitor from "@/components/editor/ProgramMonitor";
import RightPanel from "@/components/editor/RightPanel";
import Timeline from "@/components/editor/Timeline";
import ExportModal from "@/components/editor/ExportModal";
import SequenceSettingsModal from "@/components/editor/SequenceSettingsModal";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useEditorStore } from "@/store/editorStore";
import "@/store/projectHistoryStore";
import { useTimelineStore } from "@/store/timelineStore";

export default function EditorPage() {
  useKeyboardShortcuts();

  const initDefaultTracks = useTimelineStore((s) => s.initDefaultTracks);
  const colorMode = useEditorStore((s) => s.colorMode);
  const setColorMode = useEditorStore((s) => s.setColorMode);

  // Initialize default tracks if empty
  useEffect(() => {
    const tracks = useTimelineStore.getState().tracks;
    if (tracks.length === 0) {
      initDefaultTracks();
    }
  }, [initDefaultTracks]);

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
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: "var(--bg-app)" }}>
      {/* Top Toolbar */}
      <Toolbar />

      {/* Main content area: vertical split (top panels | bottom timeline) */}
      <PanelGroup orientation="vertical" className="flex-1">
        {/* Top row: 3 panels side-by-side */}
        <Panel defaultSize={65} minSize={40}>
          <PanelGroup orientation="horizontal">
            {/* Left: Media Panel */}
            <Panel defaultSize={20} minSize={12}>
              <MediaPanel />
            </Panel>

            <PanelResizeHandle />

            {/* Center: Program Monitor */}
            <Panel defaultSize={50} minSize={30}>
              <ProgramMonitor />
            </Panel>

            <PanelResizeHandle />

            {/* Right: inspector/editor tabs */}
            <Panel defaultSize={30} minSize={18}>
              <RightPanel />
            </Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle />

        {/* Bottom: Timeline */}
        <Panel defaultSize={35} minSize={15}>
          <Timeline />
        </Panel>
      </PanelGroup>

      {/* Export Modal */}
      <ExportModal />
      <SequenceSettingsModal />
    </div>
  );
}
