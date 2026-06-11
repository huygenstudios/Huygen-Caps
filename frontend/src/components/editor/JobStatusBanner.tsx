"use client";

import React, { useEffect } from "react";
import { usePersistentJobs } from "@/hooks/usePersistentJobs";
import { getJob, getExportJobStatus } from "@/lib/api";

export default function JobStatusBanner() {
  const { jobState, updateJobState } = usePersistentJobs();
  const { activeCaptionJobId, activeExportJobId } = jobState;

  // Poll caption job if active
  useEffect(() => {
    if (!activeCaptionJobId) return;

    let timeoutId: NodeJS.Timeout;
    
    async function pollCaption() {
      if (!activeCaptionJobId) return;
      try {
        const res = await getJob(activeCaptionJobId);
        updateJobState({
          lastKnownCaptionStatus: res.status,
          lastError: res.error || null,
        });

        if (res.status === "completed" || res.status === "failed") {
          // Clear active but keep last known
          updateJobState({ activeCaptionJobId: null });
        } else {
          timeoutId = setTimeout(pollCaption, 2000);
        }
      } catch {
        // Ignore error
      }
    }

    pollCaption();

    return () => clearTimeout(timeoutId);
  }, [activeCaptionJobId, updateJobState]);

  // Poll export job if active
  useEffect(() => {
    if (!activeExportJobId) return;

    let timeoutId: NodeJS.Timeout;
    
    async function pollExport() {
      if (!activeExportJobId) return;
      try {
        const res = await getExportJobStatus(activeExportJobId);
        updateJobState({
          lastKnownExportStatus: res.status,
          lastKnownStage: res.stage || null,
          lastKnownProgress: res.progress || 0,
          lastError: res.error || null,
        });

        if (res.status === "completed" || res.status === "failed") {
          updateJobState({ activeExportJobId: null, lastExportJobId: activeExportJobId });
        } else {
          timeoutId = setTimeout(pollExport, 2000);
        }
      } catch {
        updateJobState({
          activeExportJobId: null,
          lastKnownExportStatus: "error",
          lastError: "Export job not found or expired.",
        });
      }
    }

    pollExport();

    return () => clearTimeout(timeoutId);
  }, [activeExportJobId, updateJobState]);

  // Determine what to show
  const isCaptionActive = !!activeCaptionJobId || jobState.lastKnownCaptionStatus === "completed" || jobState.lastKnownCaptionStatus === "failed";
  const isExportActive = !!activeExportJobId || jobState.lastKnownExportStatus === "completed" || jobState.lastKnownExportStatus === "failed";

  if (!isCaptionActive && !isExportActive) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {isCaptionActive && (
        <div className="bg-surface border border-border/50 rounded-lg shadow-lg p-3 pointer-events-auto flex items-center justify-between gap-4">
          <div className="text-sm text-foreground">
            {activeCaptionJobId ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                Generating Captions...
              </span>
            ) : jobState.lastKnownCaptionStatus === "completed" ? (
              <span className="text-green-500">Captions Generated</span>
            ) : (
              <span className="text-red-500">Caption Error: {jobState.lastError}</span>
            )}
          </div>
          {!activeCaptionJobId && (
            <button onClick={() => updateJobState({ lastKnownCaptionStatus: null })} className="text-muted-foreground hover:text-foreground">
              ✕
            </button>
          )}
        </div>
      )}

      {isExportActive && (
        <div className="bg-surface border border-border/50 rounded-lg shadow-lg p-3 pointer-events-auto flex items-center justify-between gap-4">
          <div className="text-sm text-foreground flex-1">
            {activeExportJobId ? (
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                  Exporting Video...
                </span>
                <div className="text-xs text-muted-foreground">
                  Stage: {jobState.lastKnownStage || "queued"} ({jobState.lastKnownProgress}%)
                </div>
                <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.max(5, jobState.lastKnownProgress)}%` }}></div>
                </div>
              </div>
            ) : jobState.lastKnownExportStatus === "completed" ? (
              <div className="flex flex-col gap-1">
                <span className="text-green-500 font-medium">Export Complete!</span>
                <span className="text-xs text-muted-foreground">Open the Export Menu to download.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <span className="text-red-500">Export Error</span>
                <span className="text-xs text-muted-foreground line-clamp-2">{jobState.lastError || "Failed"}</span>
              </div>
            )}
          </div>
          {!activeExportJobId && (
            <button onClick={() => updateJobState({ lastKnownExportStatus: null })} className="text-muted-foreground hover:text-foreground px-2 py-1">
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
