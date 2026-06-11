import os
import sys
import time
import json
import subprocess
from datetime import datetime

def run_script(script_name: str) -> bool:
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Running {script_name}...")
    start_time = time.time()
    
    env = os.environ.copy()
    env["PYTHONPATH"] = os.path.abspath(".")
    result = subprocess.run(
        [sys.executable, f"scripts/{script_name}"],
        capture_output=True,
        text=True,
        env=env
    )
    
    duration = time.time() - start_time
    success = result.returncode == 0
    
    if success:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] PASS: {script_name} passed in {duration:.2f}s")
    else:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] FAIL: {script_name} failed in {duration:.2f}s")
        print("Stdout:\n", result.stdout)
        print("Stderr:\n", result.stderr)
        
    return {
        "script": script_name,
        "success": success,
        "duration_sec": duration,
        "stdout": result.stdout,
        "stderr": result.stderr
    }

def main():
    print("================================================")
    print("Stage 1 Launch Benchmark & Preflight Gate")
    print("================================================")
    
    scripts = [
        "smoke_stt_language_modes.py",
        "smoke_storage_adapter.py",
        "smoke_audio_only_import.py",
        "smoke_subtitle_import.py",
        "smoke_billing_razorpay.py",
        "smoke_export_queue.py",
        "smoke_mobile_job_state.py"
    ]
    
    results = []
    start_time = time.time()
    
    for script in scripts:
        res = run_script(script)
        results.append(res)
        
    # Optional Real Media Mode
    run_real_media = os.environ.get("CAPINSTA_BENCHMARK_REAL_MEDIA", "false").lower() == "true"
    if run_real_media:
        print("\n[CAPINSTA_BENCHMARK_REAL_MEDIA=true] Real media mode requested...")
        print("Skipping full E2E run as benchmark_samples/ are not yet standardized.")
        # Future enhancement: loop over benchmark_samples/ and run full API flow
        
    total_duration = time.time() - start_time
    success_count = sum(1 for r in results if r["success"])
    
    # Generate JSON
    os.makedirs("benchmark_results", exist_ok=True)
    report_data = {
        "timestamp": datetime.now().isoformat(),
        "total_duration_sec": total_duration,
        "passed": success_count,
        "total": len(scripts),
        "results": [
            {
                "script": r["script"],
                "success": r["success"],
                "duration": r["duration_sec"]
            }
            for r in results
        ]
    }
    
    with open("benchmark_results/stage1_launch_report.json", "w") as f:
        json.dump(report_data, f, indent=2)
        
    # Generate Markdown
    with open("benchmark_results/stage1_launch_report.md", "w") as f:
        f.write("# Stage 1 Launch Benchmark Report\n\n")
        f.write(f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"**Total Duration:** {total_duration:.2f}s\n")
        f.write(f"**Pass Rate:** {success_count}/{len(scripts)}\n\n")
        f.write("## Test Suite\n")
        for r in results:
            icon = "PASS" if r["success"] else "FAIL"
            f.write(f"- {icon} `{r['script']}` ({r['duration_sec']:.2f}s)\n")
            
    print("\n================================================")
    print(f"Benchmark Complete: {success_count}/{len(scripts)} passed in {total_duration:.2f}s")
    print("Reports saved to benchmark_results/")
    print("================================================")
    
    if success_count < len(scripts):
        sys.exit(1)

if __name__ == "__main__":
    main()
