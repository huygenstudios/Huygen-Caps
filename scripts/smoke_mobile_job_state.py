import os

def check_file_for_content(filepath: string, required_strings: list[str]):
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return False
        
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    missing = []
    for req in required_strings:
        if req not in content:
            missing.append(req)
            
    if missing:
        print(f"Missing expected logic in {filepath}:")
        for m in missing:
            print(f"  - {m}")
        return False
        
    print(f"Verified logic in {filepath}")
    return True

def main():
    print("--- Stage 1J Mobile Job State Smoke Check ---")
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    frontend_dir = os.path.join(base_dir, "frontend", "src")
    
    checks = [
        {
            "file": os.path.join(frontend_dir, "lib", "jobPersistence.ts"),
            "requires": [
                "export interface PersistentJobState",
                "localStorage.getItem",
                "capinsta-job-state-changed"
            ]
        },
        {
            "file": os.path.join(frontend_dir, "hooks", "usePersistentJobs.ts"),
            "requires": [
                "usePersistentJobs",
                "window.addEventListener",
                "capinsta-job-state-changed"
            ]
        },
        {
            "file": os.path.join(frontend_dir, "components", "editor", "JobStatusBanner.tsx"),
            "requires": [
                "usePersistentJobs()",
                "activeCaptionJobId",
                "activeExportJobId",
                "getJob",
                "getExportJobStatus"
            ]
        },
        {
            "file": os.path.join(frontend_dir, "components", "editor", "ExportModal.tsx"),
            "requires": [
                "usePersistentJobs",
                "jobState.activeExportJobId",
                "updateJobState({ activeExportJobId: started.jobId"
            ]
        },
        {
            "file": os.path.join(frontend_dir, "components", "editor", "CaptionEditorPanel.tsx"),
            "requires": [
                "usePersistentJobs",
                "updateJobState({ activeCaptionJobId: result.job_id"
            ]
        }
    ]
    
    all_passed = True
    for check in checks:
        if not check_file_for_content(check["file"], check["requires"]):
            all_passed = False
            
    if all_passed:
        print("All frontend job persistence components verified statically.")
    else:
        print("Mobile job persistence verification failed.")
        exit(1)

if __name__ == "__main__":
    main()
