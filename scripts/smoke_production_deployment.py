import os
import sys
import time
import requests
import argparse
from datetime import datetime

def print_step(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] \u2192 {msg}")

def print_pass(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] PASS: {msg}")

def print_fail(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] FAIL: {msg}")

def test_endpoint(name: str, url: str, expected_status: int = 200) -> bool:
    print_step(f"Testing {name} at {url}...")
    try:
        start = time.time()
        resp = requests.get(url, timeout=10)
        duration = time.time() - start
        
        if resp.status_code == expected_status:
            print_pass(f"{name} responded {resp.status_code} in {duration:.2f}s")
            try:
                data = resp.json()
                print(f"      Payload: {data}")
            except:
                pass
            return True
        else:
            print_fail(f"{name} responded {resp.status_code} (expected {expected_status})")
            print(f"      Response: {resp.text[:500]}")
            return False
    except Exception as e:
        print_fail(f"{name} request failed: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Smoke test a Capinsta production deployment.")
    parser.add_argument("--base-url", dest="url", default=os.getenv("BASE_URL"), help="The base URL of the deployed API (e.g. https://api.capinsta.com)")
    parser.add_argument("--test-subtitle-import", action="store_true", help="Test subtitle import")
    parser.add_argument("--test-audio-upload", action="store_true", help="Test audio upload")
    parser.add_argument("--test-export-queue", action="store_true", help="Test export queue")
    parser.add_argument("--test-r2-download", action="store_true", help="Test R2 download")
    args = parser.parse_args()
    
    base_url = args.url
    if not base_url:
        print("Error: --base-url or BASE_URL environment variable is required.")
        print("Example: python scripts/smoke_production_deployment.py --base-url https://api.capinsta.com")
        sys.exit(1)
        
    base_url = base_url.rstrip("/")
    print("================================================")
    print(f"Stage 1 Production Smoke Check")
    print(f"Target: {base_url}")
    print("================================================")
    
    success = True
    
    # 1. Base Health
    if not test_endpoint("Base Health", f"{base_url}/health"):
        success = False
        
    # 2. Export Diagnostics
    if not test_endpoint("Export Diagnostics", f"{base_url}/api/health/export"):
        success = False
        
    # 3. Usage Endpoint
    # Need to simulate anonymous usage
    print_step(f"Testing Anonymous Usage at {base_url}/api/usage...")
    try:
        resp = requests.get(f"{base_url}/api/usage", headers={"X-Anonymous-Session": "smoke_test_123"}, timeout=10)
        if resp.status_code == 200:
            print_pass(f"Usage endpoint OK")
        else:
            print_fail(f"Usage endpoint returned {resp.status_code}")
            success = False
    except Exception as e:
        print_fail(f"Usage endpoint failed: {e}")
        success = False
        
    # 4. Billing Plans
    if not test_endpoint("Billing Plans", f"{base_url}/api/billing/plans"):
        success = False

    # 5. Frontend Root Loads
    if not test_endpoint("Frontend Root", f"{base_url}/"):
        success = False

    # Optional tests
    if args.test_subtitle_import:
        print_step("Subtitle import test not fully implemented in smoke script yet.")
        
    if args.test_audio_upload:
        print_step("Audio upload test not fully implemented in smoke script yet.")
        
    if args.test_export_queue:
        print_step("Export queue test not fully implemented in smoke script yet.")
        
    if args.test_r2_download:
        print_step("R2 download test not fully implemented in smoke script yet.")

    print("\n================================================")
    if success:
        print("PRODUCTION SMOKE TEST PASSED.")
        sys.exit(0)
    else:
        print("PRODUCTION SMOKE TEST FAILED.")
        sys.exit(1)

if __name__ == "__main__":
    main()
