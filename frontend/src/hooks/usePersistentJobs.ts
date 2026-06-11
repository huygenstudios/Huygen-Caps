import { useState, useEffect } from "react";
import { loadPersistentJobState, savePersistentJobState, PersistentJobState } from "@/lib/jobPersistence";

export function usePersistentJobs() {
  const [jobState, setJobState] = useState<PersistentJobState>(loadPersistentJobState());

  useEffect(() => {
    function handleStateChange(e: Event) {
      const customEvent = e as CustomEvent<PersistentJobState>;
      setJobState(customEvent.detail);
    }
    
    // Listen for custom event across tabs/components
    window.addEventListener("capinsta-job-state-changed", handleStateChange);
    
    // Initial load
    setJobState(loadPersistentJobState());
    
    return () => {
      window.removeEventListener("capinsta-job-state-changed", handleStateChange);
    };
  }, []);

  return {
    jobState,
    updateJobState: savePersistentJobState,
  };
}
