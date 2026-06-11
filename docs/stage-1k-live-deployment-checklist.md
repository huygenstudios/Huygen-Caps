# Stage 1K Live Deployment Verification Checklist

This is the exact step-by-step checklist to verify the live Coolify deployment on Hostinger KVM 1.

## Phase 1: Environment Setup
- [ ] **1. Coolify Project Setup**: Create a new Project and Environment in Coolify.
- [ ] **2. API Service Setup**: Add the repo as an Application (Nixpacks/Dockerfile), port `10000`, start command `sh -c "uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-10000}"`, health check route `/health`.
- [ ] **3. Worker Service Setup**: Add the repo as a second Application (Dockerfile), no port, start command `python scripts/run_export_worker.py`.
- [ ] **4. Shared Volume Setup**: Map `/data` to the EXACT same Host Path (e.g. `/data/coolify/services/huygen-caps-data`) for BOTH services.

## Phase 2: Environment Variables
### Required Env Vars (Set in both services)
- [ ] `STORAGE_BACKEND=r2` (or `local` if no R2)
- [ ] `NODE_ENV=production`
- [ ] `PORT=10000`
- [ ] `TEMP_DIR=/data/tmp`
- [ ] `UPLOAD_DIR=/data/uploads`
- [ ] `EXPORT_DIR=/data/exports`
- [ ] `DB_PATH=/data/database.sqlite`
- [ ] `WORKER_CONCURRENCY=1`
- [ ] `EXPORT_CONCURRENCY=1`
- [ ] `MAX_CONCURRENT_EXPORTS=1`
- [ ] `EXPORT_FFMPEG_THREADS=1`

### Optional / External Integrations
- [ ] **7. R2 Setup**: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT_URL`, `R2_PUBLIC_DOMAIN`.
- [ ] **8. Supabase Setup**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`.
- [ ] **9. Razorpay Setup**: `RAZORPAY_BILLING_ENABLED=false` (or `true` with keys).
- [ ] **10. Sarvam Key Setup**: `SARVAM_API_KEY`.
- [ ] **11. Deepgram Disabled**: Ensure `STT_DEEPGRAM_ENABLED=false` (or omitted).

## Phase 3: Live Verification
- [ ] **12. API Health Check**: Visit `https://your-domain.com/health` and verify `status: "ok"`.
- [ ] **13. Worker Verification**: Check Coolify logs for the worker service. It should say "Starting background export worker...".
- [ ] **14. Upload Test**: Upload a short video via the UI.
- [ ] **15. Subtitle Import Test**: Import an SRT file via the UI.
- [ ] **16. Audio Import Test**: Import an MP3 file via the UI.
- [ ] **17. Export Queue Test**: Initiate an export. Verify UI shows queue status. Check worker logs to see it claim and process the job.
- [ ] **18. R2 Download Test**: If `STORAGE_BACKEND=r2`, click Download on the finished export. Ensure it serves a presigned R2 URL.
- [ ] **19. Razorpay Webhook Test**: (If enabled) Send a test webhook from Razorpay dashboard and check API logs for 200 OK.
- [ ] **20. Mobile Persistence**: Close browser tab during an export, reopen, verify `JobStatusBanner` restores state.

## Phase 4: Maintenance Setup
- [ ] **21. Cleanup Cron Setup**: Add Coolify Cron Job running `python scripts/cleanup_expired_storage.py` hourly (`0 * * * *`).
- [ ] **22. Rollback Plan**: Identify the Deployments tab in Coolify to instantly rollback if needed.
- [ ] **23. Go/No-Go Decision**: If all tests pass, system is LIVE.
