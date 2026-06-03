/* Huygen Caps - caption-first editor shell */

"use client";

import React, { useEffect } from "react";

import CaptionFirstLeftPanel from "@/components/editor/CaptionFirstLeftPanel";
import CaptionStylePanel from "@/components/editor/CaptionStylePanel";
import ExportModal from "@/components/editor/ExportModal";
import ProgramMonitor from "@/components/editor/ProgramMonitor";
import SequenceSettingsModal from "@/components/editor/SequenceSettingsModal";
import Timeline from "@/components/editor/Timeline";
import Toolbar from "@/components/editor/Toolbar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useEditorStore } from "@/store/editorStore";
import "@/store/projectHistoryStore";
import { useTimelineStore } from "@/store/timelineStore";

export default function EditorPage() {
  useKeyboardShortcuts();

  const initDefaultTracks = useTimelineStore((s) => s.initDefaultTracks);
  const colorMode = useEditorStore((s) => s.colorMode);
  const setColorMode = useEditorStore((s) => s.setColorMode);

  useEffect(() => {
    const tracks = useTimelineStore.getState().tracks;
    if (tracks.length === 0) initDefaultTracks();
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
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: "var(--bg-app)" }}>
      <Toolbar />

      <main
        className="grid min-h-0 flex-1 gap-1 p-1"
        style={{ gridTemplateRows: "minmax(0, 1fr) 236px" }}
      >
        <section className="min-h-0 min-w-0 overflow-auto">
          <div
            className="grid h-full min-h-[420px] gap-1"
            style={{
              minWidth: "1080px",
              gridTemplateColumns:
                "minmax(340px, 420px) minmax(420px, 1fr) minmax(320px, 370px)",
            }}
          >
            <div className="min-h-0 min-w-0 overflow-hidden">
              <CaptionFirstLeftPanel />
            </div>
            <div className="min-h-0 min-w-0 overflow-hidden">
              <ProgramMonitor />
            </div>
            <aside className="panel min-h-0 min-w-0 overflow-hidden">
              <CaptionStylePanel />
            </aside>
          </div>
        </section>

        <section className="min-h-0 min-w-0 overflow-hidden">
          <Timeline />
        </section>
      </main>

      <ExportModal />
      <SequenceSettingsModal />
    </div>
  );
}
