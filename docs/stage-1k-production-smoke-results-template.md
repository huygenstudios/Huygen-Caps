# Stage 1K Production Smoke Results

**Date:** YYYY-MM-DD
**Environment:** Live (Coolify)
**Base URL:** https://captions.huygenstudios.com

| Test Name | Command / Action | Expected Result | Actual Result | Pass/Fail | Notes |
|---|---|---|---|---|---|
| **API Health** | `GET /health` | 200 OK | | | |
| **Worker Boot** | Check Coolify Worker Logs | "Starting background export worker..." | | | |
| **DB Shared Volume** | Compare API logs & Worker logs | Worker logs indicate DB is accessible and identical to API. | | | |
| **Upload** | Upload video via UI | 200 OK | | | |
| **Subtitle Import** | Upload SRT via UI | 200 OK | | | |
| **Audio Import** | Upload MP3 via UI | 200 OK | | | |
| **Export Queue** | Initiate export | 200 OK, Job Status progresses to "completed" | | | |
| **Export Retry** | Force fail and retry | Retry succeeds | | | |
| **R2 Download** | Click Download | Serves R2 presigned URL | | | |
| **Razorpay Webhook** | Trigger via Razorpay Test Dashboard | 200 OK in API Logs | | | |
| **Mobile Refresh Restore** | Refresh page during export | `JobStatusBanner` restores state correctly | | | |
| **Cleanup Script** | Dry-run `cleanup_expired_storage.py` | Runs successfully without errors | | | |
