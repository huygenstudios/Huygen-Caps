import re

with open('frontend/src/components/editor/ExportModal.tsx', 'r') as f:
    code = f.read()

# 1. Imports
code = code.replace('startHeadlessExportJob } from "@/lib/api";', 'startHeadlessExportJob, retryExportJob } from "@/lib/api";')

# 2. State
code = code.replace('const [downloadName, setDownloadName] = useState("");', 'const [downloadName, setDownloadName] = useState("");\n  const [currentExportJobId, setCurrentExportJobId] = useState("");')

# 3. Extract pollExportStatus
poll_func = """
  const pollExportStatus = async (exportJobId: string, format: ExportFormat, mp4Mode: string) => {
      let missedPolls = 0;
      while (!pollCancelledRef.current) {
        await wait(1500);
        try {
          const status = await getExportJobStatus(exportJobId);
          missedPolls = 0;
          const nextPercent = Math.max(0, Math.min(100, status.progress || 0));
          setExportPercent(nextPercent);
          setExportStatus(status.message || status.stage || status.status);

          if (status.status === "completed") {
            if (!status.downloadUrl) {
              throw new Error("Export completed but did not return a download URL.");
            }
            setDownloadUrl(resolveBackendUrl(toAttachmentDownloadUrl(status.downloadUrl)));
            setDownloadName(status.filename || `huygen_caps_${mp4Mode}_${exportDimensions.width}x${exportDimensions.height}_${requestExportFps}fps.mp4`);
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
  };

  const handleRetry = async () => {
    if (!currentExportJobId) return;
    setExportError("");
    setExportStatus("Retrying export...");
    setExportPercent(0);
    setExporting(true);
    pollCancelledRef.current = false;
    
    try {
      await retryExportJob(currentExportJobId);
      await pollExportStatus(currentExportJobId, selectedOption.format, selectedMp4Mode);
    } catch (err: unknown) {
      pollCancelledRef.current = true;
      setExportError(formatExportError(err));
      setExportStatus("Export failed");
      setExportPercent(-1);
      setExporting(false);
    }
  };

"""

# Insert BEFORE handleExport
code = code.replace('  const handleExport = async (format: ExportFormat, mp4Mode: "full_video" | "captions_only" = exportSettings.mode) => {', poll_func + '  const handleExport = async (format: ExportFormat, mp4Mode: "full_video" | "captions_only" = exportSettings.mode) => {')

# 4. Replace while loop inside handleExport
while_loop = """      let missedPolls = 0;
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
            setDownloadUrl(resolveBackendUrl(toAttachmentDownloadUrl(status.downloadUrl)));
            setDownloadName(status.filename || `huygen_caps_${mp4Mode}_${exportDimensions.width}x${exportDimensions.height}_${requestExportFps}fps.mp4`);
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
      }"""

replacement = """      setCurrentExportJobId(started.jobId);
      await pollExportStatus(started.jobId, format, mp4Mode);"""

code = code.replace(while_loop, replacement)

# 5. UI Add Retry Button
ui_original = """          ) : exportError ? (
            <div className="editor-notice error flex items-center justify-between gap-3">
              <span className="max-h-40 min-w-0 overflow-auto whitespace-pre-wrap break-words">{exportError}</span>
              <button onClick={() => setExportError("")}>Clear</button>
            </div>
          ) : exporting ? ("""

ui_replace = """          ) : exportError ? (
            <div className="editor-notice error flex items-center justify-between gap-3">
              <span className="max-h-40 min-w-0 overflow-auto whitespace-pre-wrap break-words">{exportError}</span>
              <div className="flex gap-2 shrink-0">
                {currentExportJobId && <button onClick={handleRetry} className="btn-secondary px-2 py-1">Retry</button>}
                <button onClick={() => setExportError("")}>Clear</button>
              </div>
            </div>
          ) : exporting ? ("""

code = code.replace(ui_original, ui_replace)

with open('frontend/src/components/editor/ExportModal.tsx', 'w') as f:
    f.write(code)
