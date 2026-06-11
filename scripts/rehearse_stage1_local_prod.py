import os
import sys
import subprocess

def run_command(cmd, env=None):
    print(f"\n--- Running: {' '.join(cmd)} ---")
    result = subprocess.run(cmd, env=env)
    if result.returncode != 0:
        print(f"FAIL: Command failed: {' '.join(cmd)}")
        sys.exit(result.returncode)
    print(f"PASS: Command passed: {' '.join(cmd)}")

def main():
    print("================================================")
    print("Stage 1 Local Production Rehearsal")
    print("================================================")
    
    # 1. Setup minimal production-like env
    env = os.environ.copy()
    env["PYTHONPATH"] = os.path.abspath(".")
    env["NODE_ENV"] = "production"
    env["STORAGE_BACKEND"] = "local"
    env["RAZORPAY_BILLING_ENABLED"] = "false"
    env["STT_DEEPGRAM_ENABLED"] = "false"
    env["EXPORT_CONCURRENCY"] = "1"
    env["MAX_CONCURRENT_EXPORTS"] = "1"
    
    # Use isolated data dir for rehearsal
    rehearsal_dir = os.path.abspath(".rehearsal_data")
    os.makedirs(rehearsal_dir, exist_ok=True)
    env["TEMP_DIR"] = os.path.join(rehearsal_dir, "tmp")
    env["UPLOAD_DIR"] = os.path.join(rehearsal_dir, "uploads")
    env["EXPORT_DIR"] = os.path.join(rehearsal_dir, "exports")
    env["DB_PATH"] = os.path.join(rehearsal_dir, "database.sqlite")
    
    print(f"Using isolated data directory: {rehearsal_dir}")
    
    # 2. Run the Benchmark script
    run_command([sys.executable, "scripts/benchmark_stage1_launch.py"], env=env)
    
    # 3. Run the export worker once
    run_command([sys.executable, "scripts/run_export_worker.py", "--once"], env=env)
    
    # 4. Check Frontend build
    print("\n--- Verifying Frontend Build ---")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    npx_cmd = "npx.cmd" if os.name == "nt" else "npx"
    
    frontend_dir = os.path.join(os.path.abspath("."), "frontend")
    # Linting might fail without Next.js environment context, so we skip it or run it from frontend_dir
    # actually let's run them via subprocess in frontend_dir
    res_tsc = subprocess.run([npx_cmd, "tsc", "--noEmit"], cwd=frontend_dir, env=env)
    res_lint = subprocess.run([npm_cmd, "run", "lint"], cwd=frontend_dir, env=env)
    
    if res_tsc.returncode != 0 or res_lint.returncode != 0:
        print("FAIL: Frontend validation failed.")
        sys.exit(1)
        
    print("\n================================================")
    print("STAGE 1 PRODUCTION REHEARSAL PASSED!")
    print("================================================")
    
if __name__ == "__main__":
    main()
