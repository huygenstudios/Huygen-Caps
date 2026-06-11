# Hostinger KVM 1 / Coolify Deployment Guide

This document defines the exact steps to deploy Capinsta (Huygen Caps) Stage 1 to a Hostinger KVM 1 VPS using Coolify.

## 1. VPS Assumptions
- **Hostinger KVM 1 VPS**: 1 vCPU, 1GB RAM, 50GB Disk.
- **Coolify Installed**: Coolify handles the Docker build pipeline.
- **Reverse Proxy**: Traefik/Caddy provided by Coolify.

## 2. Infrastructure Setup
Capinsta runs as two distinct Docker services within the same Coolify project, sharing a persistent data volume:
1. **API Service** (FastAPI + NextJS Static)
2. **Export Worker Service** (FastAPI Worker script)

### ⚠️ CRITICAL REQUIREMENT: Shared SQLite Volume
The API service and Worker service **must** share the exact same persistent SQLite database file for the export queue to function. In Coolify, you must define a persistent volume mapped to `/data` in *both* services.
- **Host Path:** `/data/coolify/services/huygen-caps-data`
- **Container Path:** `/data`

If they do not share the same volume, the worker will never see jobs created by the API.

## 3. Coolify App Setup: API Service
1. Create a new Resource -> Application -> Git Repository.
2. Select the Capinsta repository and branch (`main`).
3. **Build Pack:** Nixpacks / Dockerfile (The project includes a `Dockerfile`).
4. **Port:** `10000`
5. **Start Command:** `sh -c "uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-10000}"`
6. **Health Check Route:** `/health`
7. **Volume Mappings:** `/data/coolify/services/huygen-caps-data:/data`

## 4. Coolify App Setup: Export Worker Service
1. Create a second Application in the same environment.
2. Point to the same Git repository.
3. **Build Pack:** Dockerfile.
4. **Port:** N/A (The worker does not expose a port).
5. **Start Command:** `python scripts/run_export_worker.py`
6. **Health Check:** None (worker manages its own lifecycle).
7. **Volume Mappings:** `/data/coolify/services/huygen-caps-data:/data`

## 5. Required Environment Variables
Both services must use the exact same environment variables. Use Coolify's Environment Variables panel.

Copy the contents of `.env.production.example` and populate:
- `STORAGE_BACKEND=r2` (Strongly recommended to save local VPS disk space).
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_DOMAIN`, `R2_ENDPOINT_URL`.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`.
- `SARVAM_API_KEY`.
- `RAZORPAY_BILLING_ENABLED=false` (for Stage 1 initial launch, keep disabled).

## 6. KVM 1 Limitations & Resource Caps
Hostinger KVM 1 has very strict memory limits (1GB).
- **Concurrency MUST be 1.** The following env vars are hardcoded safely in the production template:
  - `WORKER_CONCURRENCY=1`
  - `EXPORT_CONCURRENCY=1`
  - `MAX_CONCURRENT_EXPORTS=1`
  - `EXPORT_FFMPEG_THREADS=1`
- If you increase concurrency, the VPS will run out of RAM during FFmpeg extraction, and the OS OOM Killer will terminate the worker.

### When to upgrade to KVM 2?
When you regularly have multiple concurrent users stuck in the export queue. KVM 2 (2GB RAM) will safely allow `WORKER_CONCURRENCY=2`.

## 7. Supabase Setup
- Create a Supabase project.
- Obtain the URL and Keys.
- The `DATABASE_URL` is technically not needed by Capinsta yet, as all primary queue state uses the shared SQLite volume in `/data`. Only Supabase Auth is actively utilized in Stage 1.

## 8. Razorpay Test Webhook Setup
- **Webhook URL:** `https://your-domain.com/api/billing/webhook/razorpay`
- **Events:** `subscription.charged`, `subscription.cancelled`.
- **Secret:** Generate a secret and place it in `RAZORPAY_WEBHOOK_SECRET`.

## 9. Cleanup Cron Setup
Because the local disk is only 50GB, and uploads/exports accumulate, you must set up a Cron Job in Coolify to purge old files.
- **Command:** `python scripts/cleanup_expired_storage.py`
- **Frequency:** Hourly (`0 * * * *`).

## 10. Rollback Steps
If deployment fails:
1. View logs in Coolify -> Logs.
2. Check if the SQLite database is locked. If so, restart both containers.
3. Use Coolify's "Deployments" tab to redeploy the previous successful commit hash.
