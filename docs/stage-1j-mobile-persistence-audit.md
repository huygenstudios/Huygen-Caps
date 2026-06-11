# Stage 1J Mobile Persistence Audit

## 1. Where caption generation job ID is stored
* **Current state:** Stored in memory via Zustand (`editorStore.ts` -> `jobId`).
* **Status:** PARTIAL.

## 2. Where export job ID is stored
* **Current state:** Stored in local component state (`ExportModal.tsx` -> `currentExportJobId`).
* **Status:** MISSING (needs global/persistent storage).

## 3. Whether job state survives
* **Switching editor panels:** Caption generation survives (Zustand). Export is lost if the modal is closed/unmounted.
* **Closing/opening subtitle panel:** Caption generation survives.
* **Mobile viewport layout changes:** Survives unless the layout change unmounts the modal.
* **Route changes:** Lost (Zustand is memory-only, no `persist` middleware configured).
* **Page refresh:** Lost entirely.
* **Auth state change:** Lost if accompanied by a refresh.
* **Status:** MISSING.

## 4. Current polling behavior
* **Caption generation jobs:** Uses WebSocket hook (`useWebSocket`) reacting to `jobId`.
* **Export jobs:** Manual polling loop inside `ExportModal.tsx` (`pollExportStatus`), which dies if the modal unmounts.
* **Status:** PARTIAL.

## 5. Current failure behavior
* **Generation failed:** Handled via pipeline progress status.
* **Export failed:** Handled in `ExportModal.tsx` (Retry button).
* **Expired export:** Handled (API responds 404 or backend handles it).
* **Quota exceeded:** Handled during generation/export trigger.
* **Status:** DONE.

## 6. Current mobile-specific risks
* `ExportModal` unmounting (e.g. clicking outside) loses the export job reference and stops polling.
* Mobile browsers frequently suspend background tabs or refresh, which wipes memory-only state.
* Long-running exports (even 30-60s) on mobile are very likely to be backgrounded and lose state.

## 7. Files/functions to change
* `frontend/src/store/editorStore.ts`: (Or a new store helper) To track `activeCaptionJobId`, `activeExportJobId`, etc., and sync to `localStorage`.
* `frontend/src/components/editor/ExportModal.tsx`: To use global persistent state for export job ID instead of local `useState`.
* `frontend/src/components/editor/CaptionEditorPanel.tsx` (and `Toolbar.tsx`): To use the persistent store and lock the UI properly.
* Global App level (e.g., `layout.tsx` or a new hook): To handle restore/resume logic on app mount.
* `frontend/src/lib/api.ts`: Ensure `X-Anonymous-Session` is explicitly passed in all job-related APIs.

* **Status:** MISSING (Implementation required).
