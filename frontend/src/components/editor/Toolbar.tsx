/* Toolbar - caption-first top chrome */
/* eslint-disable @next/next/no-img-element */

"use client";

import React from "react";
import { Download, Moon, Redo2, RotateCcw, Save, Sun, Undo2, UploadCloud, UserCircle } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { useProjectHistoryStore } from "@/store/projectHistoryStore";
import { openMediaPicker } from "@/lib/mediaImport";
import { supabase } from "@/lib/supabaseClient";
import { getBillingMe, getUserUsage } from "@/lib/api";
import { RESET_PANEL_LAYOUT_EVENT } from "@/hooks/usePanelLayoutPersistence";
import { usePersistentJobs } from "@/hooks/usePersistentJobs";

export default function Toolbar() {
  const {
    colorMode,
    setColorMode,
    setLeftSidebarTab,
    setMediaPanelTab,
    setShowExportModal,
  } = useEditorStore();
  const { undo, redo, canUndo, canRedo } = useProjectHistoryStore();
  const [userEmail, setUserEmail] = React.useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = React.useState<string>("free");
  const [billingEnabled, setBillingEnabled] = React.useState<boolean>(false);
  const [remainingExports, setRemainingExports] = React.useState<number | null>(null);
  const { jobState } = usePersistentJobs();
  const isExportActive = !!jobState.activeExportJobId;

  React.useEffect(() => {
    if (!supabase) return;
    
    const checkUser = async () => {
      if (!supabase) return;
      const { data: { session } } = await supabase.auth.getSession();
      setUserEmail(session?.user?.email || null);
      
      try {
        const usage = await getUserUsage().catch(() => null);
        if (usage) setRemainingExports(usage.remaining_exports);
      } catch {
      }

      if (session?.user) {
        try {
          const billing = await getBillingMe();
          setCurrentPlan(billing.current_plan || "free");
          setBillingEnabled(billing.billing_enabled);
        } catch (e) {
          console.error("Failed to fetch billing info", e);
        }
      } else {
        setCurrentPlan("free");
      }
    };
    
    checkUser();
    
    const authListener = supabase.auth.onAuthStateChange((event, session) => {
      setUserEmail(session?.user?.email || null);
      if (!session?.user) {
        setCurrentPlan("free");
      } else {
        checkUser();
      }
    });
    return () => {
      authListener.data?.subscription.unsubscribe();
    };
  }, []);

  const openImport = () => {
    setLeftSidebarTab("media");
    setMediaPanelTab("project");
    void openMediaPicker();
  };

  const resetPanelLayout = () => {
    window.dispatchEvent(new CustomEvent(RESET_PANEL_LAYOUT_EVENT));
  };

  return (
    <div className="toolbar-shell flex h-12 min-w-0 shrink-0 select-none items-center gap-2 overflow-hidden px-2">
      <div className="brand-mark mr-1 min-w-0 shrink">
        <img
          className="brand-logo"
          src="/brand/huygen-logo.png"
          alt="Huygen Caps"
          width={30}
          height={30}
          style={{ width: 30, height: 30, maxWidth: 30, maxHeight: 30, objectFit: "contain" }}
        />
        <span className="brand-name truncate">Huygen Caps</span>
      </div>

      <button
        className="toolbar-import btn-ghost inline-flex shrink-0 items-center gap-2"
        style={{ background: "var(--bg-control)", color: "var(--text-muted)", borderColor: "var(--border-strong)" }}
        onClick={openImport}
        title="Import Video"
      >
        <UploadCloud size={14} />
        <span className="toolbar-button-label">Import Video</span>
      </button>

      <div className="toolbar-badge hidden rounded px-2 py-1 text-[10px] font-bold uppercase sm:block" style={{ color: "var(--text-muted)", background: "var(--bg-control)", border: "1px solid var(--border)" }}>
        Caption Generator
      </div>

      <button className="icon-button hidden sm:inline-grid" disabled={!canUndo} onClick={undo} title="Undo">
        <Undo2 size={15} />
      </button>
      <button className="icon-button hidden sm:inline-grid" disabled={!canRedo} onClick={redo} title="Redo">
        <Redo2 size={15} />
      </button>

      <div className="flex-1" />

      <span className="hidden text-[11px] xl:inline" style={{ color: "var(--text-muted)" }}>
        Last edited a few seconds ago
      </span>

      <button className="icon-button hidden sm:inline-grid" title="Save project">
        <Save size={15} />
      </button>
      <button className="icon-button hidden sm:inline-grid" onClick={resetPanelLayout} title="Reset panel layout">
        <RotateCcw size={15} />
      </button>
      <button
        className="icon-button"
        onClick={() => setColorMode(colorMode === "dark" ? "light" : "dark")}
        title={colorMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {colorMode === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      {remainingExports !== null && (
        <div 
          className="hidden sm:flex items-center text-[10px] px-2 py-0.5 rounded tracking-wider mr-2 font-semibold" 
          style={{ background: "var(--bg-control)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
          title={`${remainingExports} exports remaining today`}
        >
          {remainingExports} EXPORTS LEFT
        </div>
      )}

      {userEmail ? (
        <div className="flex items-center gap-2 mr-2">
          {billingEnabled && currentPlan !== "pro" && (
            <button 
              className="text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider"
              style={{ background: "var(--primary-main)", color: "var(--primary-text)" }}
              onClick={() => window.location.href = "/billing"}
              title="Upgrade Plan"
            >
              UPGRADE
            </button>
          )}
          {billingEnabled && currentPlan === "pro" && (
            <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold tracking-wider" style={{ background: "var(--bg-active)", color: "var(--primary-main)", border: "1px solid var(--primary-main)" }}>
              PRO
            </span>
          )}
          <div className="text-xs text-muted-foreground truncate max-w-[150px]" title={userEmail}>
            {userEmail.split("@")[0]}
            <button 
              onClick={() => supabase?.auth.signOut()} 
              className="ml-2 hover:text-white"
              title="Sign out"
            >
              (out)
            </button>
          </div>
        </div>
      ) : (
        <button
          className="icon-button hidden sm:inline-flex items-center gap-1"
          onClick={() => window.location.href = "/login"}
          title="Sign In"
        >
          <UserCircle size={15} />
          <span className="text-[11px]">Sign In</span>
        </button>
      )}

      <button
        className={`toolbar-export btn-primary inline-flex shrink-0 items-center gap-2 ${isExportActive ? "opacity-50 cursor-not-allowed" : ""}`}
        onClick={() => !isExportActive && setShowExportModal(true)}
        disabled={isExportActive}
        title={isExportActive ? "Export currently in progress" : "Export Project"}
      >
        <span className="toolbar-export-label">{isExportActive ? "Exporting..." : "Export Project"}</span>
        <Download size={14} />
      </button>
    </div>
  );
}
