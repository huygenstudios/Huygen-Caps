import os
import sys
import argparse

def check_env(var_name: str, required: bool = False, is_secret: bool = False) -> bool:
    val = os.getenv(var_name)
    status = "[OK]" if val else "[MISSING]"
    if val and is_secret:
        display_val = "********"
    elif val:
        display_val = val
    else:
        display_val = ""
        
    print(f"{status:10} {var_name:30} {display_val}")
    
    if required and not val:
        return False
    return True

def main():
    parser = argparse.ArgumentParser(description="Sanity check production environment variables.")
    parser.add_argument("--mode", choices=["local", "prod"], default="prod", help="Mode to check for (local or prod)")
    args = parser.parse_args()
    
    print("================================================")
    print(f"Production Environment Sanity Check ({args.mode.upper()})")
    print("================================================\n")
    
    success = True
    
    print("--- Core App ---")
    if not check_env("NODE_ENV", required=(args.mode == "prod")): success = False
    check_env("PORT", required=False)
    
    print("\n--- Storage & Data Paths ---")
    storage_mode = os.getenv("STORAGE_BACKEND", "local").lower()
    print(f"STORAGE_BACKEND: {storage_mode}")
    if not check_env("TEMP_DIR", required=True): success = False
    if not check_env("UPLOAD_DIR", required=True): success = False
    if not check_env("EXPORT_DIR", required=True): success = False
    if not check_env("DB_PATH", required=True): success = False
    
    print("\n--- Concurrency Limits (KVM Safe) ---")
    concurrency = os.getenv("EXPORT_CONCURRENCY", "1")
    if concurrency != "1":
        print(f"[WARNING] EXPORT_CONCURRENCY is {concurrency}. Should be 1 for KVM 1.")
        # We don't fail, but warn
    check_env("WORKER_CONCURRENCY", required=False)
    check_env("EXPORT_CONCURRENCY", required=False)
    check_env("MAX_CONCURRENT_EXPORTS", required=False)
    check_env("EXPORT_FFMPEG_THREADS", required=False)
    
    print("\n--- R2 Readiness ---")
    r2_required = (storage_mode == "r2")
    r2_ok = True
    if not check_env("R2_ACCOUNT_ID", required=r2_required, is_secret=True): r2_ok = False
    if not check_env("R2_ACCESS_KEY_ID", required=r2_required, is_secret=True): r2_ok = False
    if not check_env("R2_SECRET_ACCESS_KEY", required=r2_required, is_secret=True): r2_ok = False
    if not check_env("R2_BUCKET_NAME", required=r2_required): r2_ok = False
    if not check_env("R2_ENDPOINT_URL", required=r2_required): r2_ok = False
    if not check_env("R2_PUBLIC_DOMAIN", required=r2_required): r2_ok = False
    
    if r2_required and not r2_ok:
        success = False
        print("[FAIL] STORAGE_BACKEND is 'r2' but R2 variables are missing.")

    print("\n--- Supabase Readiness ---")
    if not check_env("SUPABASE_URL", required=False): pass
    if not check_env("SUPABASE_ANON_KEY", required=False, is_secret=True): pass
    if not check_env("SUPABASE_SERVICE_ROLE_KEY", required=False, is_secret=True): pass
    if not check_env("SUPABASE_JWT_SECRET", required=False, is_secret=True): pass
    
    print("\n--- Razorpay Readiness ---")
    rzp_enabled = os.getenv("RAZORPAY_BILLING_ENABLED", "false").lower() == "true"
    print(f"RAZORPAY_BILLING_ENABLED: {rzp_enabled}")
    if rzp_enabled:
        if not check_env("RAZORPAY_KEY_ID", required=True): success = False
        if not check_env("RAZORPAY_KEY_SECRET", required=True, is_secret=True): success = False
        if not check_env("RAZORPAY_WEBHOOK_SECRET", required=True, is_secret=True): success = False
        
    print("\n--- STT Providers ---")
    check_env("SARVAM_API_KEY", required=False, is_secret=True)
    deepgram_enabled = os.getenv("STT_DEEPGRAM_ENABLED", "false").lower() == "true"
    print(f"Deepgram Enabled: {deepgram_enabled}")
    check_env("DEEPGRAM_API_KEY", required=False, is_secret=True)

    print("\n================================================")
    if success:
        print("RESULT: PASS")
        sys.exit(0)
    else:
        print("RESULT: FAIL. Missing required production variables.")
        sys.exit(1)

if __name__ == "__main__":
    main()
