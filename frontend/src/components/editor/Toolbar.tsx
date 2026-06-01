/* Toolbar - Huygen Caps top chrome */
/* eslint-disable @next/next/no-img-element */

"use client";

import React, { useState } from "react";
import {
  Circle,
  Copy,
  Download,
  Hand,
  Moon,
  MousePointer2,
  Redo2,
  Save,
  Scissors,
  Settings2,
  Sun,
  Trash2,
  Undo2,
  Wand2,
  ZoomIn,
} from "lucide-react";
import { isCaptionLocked } from "@/lib/editorModel";
import { ToolMode } from "@/lib/types";
import { useCaptionExport } from "@/hooks/useCaptionExport";
import { useCaptionStore } from "@/store/captionStore";
import { useEditorStore } from "@/store/editorStore";
import { useProjectHistoryStore } from "@/store/projectHistoryStore";
import { useTimelineStore } from "@/store/timelineStore";

const tools: { mode: ToolMode; icon: React.ReactNode; label: string; shortcut: string }[] = [
  { mode: "selection", icon: <MousePointer2 size={16} />, label: "Selection", shortcut: "V" },
  { mode: "razor", icon: <Scissors size={16} />, label: "Razor", shortcut: "C" },
  { mode: "hand", icon: <Hand size={16} />, label: "Hand", shortcut: "H" },
  { mode: "zoom", icon: <ZoomIn size={16} />, label: "Zoom", shortcut: "Z" },
];

function MenuItem({
  children,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button className="menu-item" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export default function Toolbar() {
  const {
    activeTool,
    setActiveTool,
    setShowExportModal,
    setShowSequenceSettings,
    setMediaPanelTab,
    setRightPanelTab,
    colorMode,
    setColorMode,
  } = useEditorStore();
  const { undo, redo, canUndo, canRedo } = useProjectHistoryStore();
  const { deleteCaption, selectedIds, captions } = useCaptionStore();
  const tracks = useTimelineStore((s) => s.tracks);
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds);
  const deleteSelectedClips = useTimelineStore((s) => s.deleteSelectedClips);
  const duplicateSelectedClips = useTimelineStore((s) => s.duplicateSelectedClips);
  const { exportSRT, exportASS } = useCaptionExport();
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const closeMenu = () => setOpenMenu(null);

  const deleteSelection = () => {
    Array.from(selectedIds).forEach((captionId) => {
      const caption = captions.find((candidate) => candidate.id === captionId);
      if (!caption || isCaptionLocked(caption, tracks)) return;
      deleteCaption(captionId);
    });
    deleteSelectedClips();
    closeMenu();
  };

  const openImport = () => {
    setMediaPanelTab("project");
    window.dispatchEvent(new Event("huygen-caps-open-import"));
    closeMenu();
  };

  const openExport = () => {
    setRightPanelTab("export-settings");
    setShowExportModal(true);
    closeMenu();
  };

  const clickById = (id: string) => {
    setRightPanelTab("caption-editor");
    window.setTimeout(() => document.getElementById(id)?.click(), 0);
    closeMenu();
  };

  const menuButton = (menu: string) => (
    <button
      key={menu}
      className={`top-menu-button ${openMenu === menu ? "active" : ""}`}
      onClick={() => setOpenMenu(openMenu === menu ? null : menu)}
    >
      {menu}
    </button>
  );

  return (
    <div className="toolbar-shell flex h-10 shrink-0 select-none items-center gap-1 px-2">
      <div className="brand-mark mr-3">
        <img className="brand-logo" src="/brand/huygen-logo.png" alt="Huygen Caps" />
        <span className="brand-name">Huygen Caps</span>
      </div>

      <div className="relative flex items-center">
        {["File", "Edit", "Sequence", "Captions", "Export"].map(menuButton)}
        {openMenu && (
          <div className="menu-popover absolute left-0 top-9 z-[80] min-w-64 p-2">
            {openMenu === "File" && (
              <>
                <MenuItem onClick={openImport}>Import media</MenuItem>
                <MenuItem onClick={() => { setShowExportModal(true); closeMenu(); }}>Export project data</MenuItem>
              </>
            )}
            {openMenu === "Edit" && (
              <>
                <MenuItem disabled={!canUndo} onClick={() => { undo(); closeMenu(); }}>
                  Undo
                </MenuItem>
                <MenuItem disabled={!canRedo} onClick={() => { redo(); closeMenu(); }}>
                  Redo
                </MenuItem>
                <MenuItem disabled={!selectedClipIds.length} onClick={() => { duplicateSelectedClips(); closeMenu(); }}>
                  <span className="inline-flex items-center gap-2"><Copy size={12} /> Duplicate selected clip</span>
                </MenuItem>
                <MenuItem disabled={!selectedClipIds.length && selectedIds.size === 0} onClick={deleteSelection}>
                  <span className="inline-flex items-center gap-2"><Trash2 size={12} /> Delete selected</span>
                </MenuItem>
              </>
            )}
            {openMenu === "Sequence" && (
              <MenuItem onClick={() => { setShowSequenceSettings(true); closeMenu(); }}>
                <span className="inline-flex items-center gap-2"><Settings2 size={12} /> Sequence Settings...</span>
              </MenuItem>
            )}
            {openMenu === "Captions" && (
              <>
                <MenuItem onClick={() => clickById("generate-captions-btn")}>
                  <span className="inline-flex items-center gap-2"><Wand2 size={12} /> Generate captions</span>
                </MenuItem>
                <MenuItem onClick={() => clickById("rebuild-captions-btn")}>Rebuild caption chunks</MenuItem>
                <MenuItem onClick={() => { setRightPanelTab("caption-editor"); closeMenu(); }}>Open caption editor</MenuItem>
                <MenuItem disabled={!captions.length} onClick={() => { exportSRT(); closeMenu(); }}>Export SRT</MenuItem>
                <MenuItem disabled={!captions.length} onClick={() => { exportASS(); closeMenu(); }}>Export ASS</MenuItem>
              </>
            )}
            {openMenu === "Export" && (
              <>
                <MenuItem onClick={() => { setRightPanelTab("export-settings"); closeMenu(); }}>Open export settings</MenuItem>
                <MenuItem onClick={openExport}>
                  <span className="inline-flex items-center gap-2"><Download size={12} /> Export MP4</span>
                </MenuItem>
              </>
            )}
          </div>
        )}
      </div>

      <div className="toolbar-divider" />

      {tools.map((tool) => (
        <button
          key={tool.mode}
          className={`icon-button ${activeTool === tool.mode ? "active" : ""}`}
          onClick={() => setActiveTool(tool.mode)}
          title={`${tool.label} (${tool.shortcut})`}
        >
          {tool.icon}
        </button>
      ))}

      <div className="toolbar-divider" />

      <button className="icon-button" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
        <Undo2 size={16} />
      </button>
      <button className="icon-button" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)">
        <Redo2 size={16} />
      </button>

      <div className="flex-1" />

      <button className="icon-button" title="Save project">
        <Save size={16} />
      </button>
      <button className="icon-button export-button" onClick={openExport} title="Export (Ctrl+M)">
        <Download size={16} />
      </button>
      <button
        className="icon-button"
        onClick={() => setColorMode(colorMode === "dark" ? "light" : "dark")}
        title={colorMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {colorMode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div className="live-chip ml-1">
        <Circle size={8} fill="currentColor" stroke="none" />
        LIVE
      </div>
    </div>
  );
}
