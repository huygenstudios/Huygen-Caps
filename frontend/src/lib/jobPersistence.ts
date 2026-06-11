import { getAnonymousSessionId } from "./api";

export interface PersistentJobState {
  activeCaptionJobId: string | null;
  activeExportJobId: string | null;
  activeSourceJobId: string | null;
  lastKnownCaptionStatus: string | null;
  lastKnownExportStatus: string | null;
  lastKnownStage: string | null;
  lastKnownProgress: number;
  lastExportJobId: string | null;
  lastError: string | null;
  updatedAt: number;
}

const DEFAULT_STATE: PersistentJobState = {
  activeCaptionJobId: null,
  activeExportJobId: null,
  activeSourceJobId: null,
  lastKnownCaptionStatus: null,
  lastKnownExportStatus: null,
  lastKnownStage: null,
  lastKnownProgress: 0,
  lastExportJobId: null,
  lastError: null,
  updatedAt: 0,
};

function getStorageKey(): string {
  // Try to use a persistent user ID. If missing, fallback to anonymous.
  let userId = "anonymous";
  if (typeof window !== "undefined") {
    // If we have an auth user id, we could grab it from a cookie or localStorage.
    // For now, we fallback to our known anonymous session ID.
    const anonId = getAnonymousSessionId();
    if (anonId) {
      userId = anonId;
    }
  }
  return `capinsta.activeJobs.v1.${userId}`;
}

export function loadPersistentJobState(): PersistentJobState {
  if (typeof window === "undefined") return { ...DEFAULT_STATE };
  
  const key = getStorageKey();
  const raw = localStorage.getItem(key);
  if (!raw) return { ...DEFAULT_STATE };
  
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch (err) {
    console.warn("Failed to parse persistent job state:", err);
    return { ...DEFAULT_STATE };
  }
}

export function savePersistentJobState(update: Partial<PersistentJobState>) {
  if (typeof window === "undefined") return;
  
  const key = getStorageKey();
  const current = loadPersistentJobState();
  const next = { ...current, ...update, updatedAt: Date.now() };
  localStorage.setItem(key, JSON.stringify(next));
  
  // Dispatch an event so hooks can pick it up if they want
  window.dispatchEvent(new CustomEvent("capinsta-job-state-changed", { detail: next }));
}

export function clearPersistentJobState() {
  if (typeof window === "undefined") return;
  
  const key = getStorageKey();
  localStorage.removeItem(key);
  window.dispatchEvent(new CustomEvent("capinsta-job-state-changed", { detail: DEFAULT_STATE }));
}
