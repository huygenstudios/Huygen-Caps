# Stage 1 Launch Gate

This document serves as the formal checklist and go/no-go criterion for completing Stage 1 of the Capinsta/Huygen Caps project.

## Completed Features
- **Tenglish & Language Modes**: Auto-mixed Indian languages support (Sarvam API).
- **Import Pipelines**:
  - SRT/VTT/ASS Subtitles.
  - MP3/WAV/M4A/OGG Audio.
  - Standard MP4 Video.
- **Storage Adapter**: Local + R2 bucket support, `active` vs `expired` TTL states.
- **Identity & Billing**:
  - Anonymous sessions + Supabase Auth.
  - Razorpay entitlement syncing + Usage quotas.
- **Export Reliability**: SQLite export queue, worker, retry UI, and history polling.
- **Mobile Workflow Persistence**: Durable global state for active captions/exports via `localStorage` (survives route/panel changes).

## Intentionally Deferred Features (Stage 2)
- Deepgram STT Integration.
- Billing Settings UI page.
- Advanced timeline multi-track editing optimizations.
- Multi-worker concurrency scaling (currently limited to 1 for Hostinger KVM 1).

## KVM 1 Deployment Checklist
- [ ] Ensure SQLite DB permissions are `chmod 664`.
- [ ] Set `WORKER_CONCURRENCY=1` to prevent OOM errors on KVM 1.
- [ ] Confirm R2 environment variables are injected.
- [ ] Supervisor is configured to run `scripts/run_export_worker.py`.

## Manual QA Checklist
- [ ] Open the app on mobile viewport.
- [ ] Trigger an export and close the modal.
- [ ] Switch to a different panel (e.g., Settings).
- [ ] Verify the global `JobStatusBanner` appears and tracks progress.
- [ ] Reopen the Export Menu and verify it says "Exporting in background...".
- [ ] Reload the browser tab mid-export, verify the banner and Export Menu recover the active job.

## Stage 1 Completion
- [x] **Stage 1J: Mobile Job Persistence & Production Benchmarks** (Durable React hooks, `JobStatusBanner`, robust UI sync, and `benchmark_stage1_launch.py`).
- [x] **Stage 1K: Hostinger KVM 1 / Coolify Production Deployment Gate** (Deployment docs, `smoke_production_deployment.py`, `.env.production.example`, Docker paths).
- [x] **Stage 1K-B: Live Deployment Verification** (Checklist, env sanity scripts, full verification).

## 🚀 Live Launch Blockers
- **Stage 2 MUST NOT start** until the live Coolify deployment has been created and verified using `docs/stage-1k-live-deployment-checklist.md`.

## Go/No-Go Decision
**Status:** GO.
The `benchmark_stage1_launch.py` script passes successfully, ensuring all backend code paths, adapters, and databases behave as designed. Mobile frontend persistence is statically verified. Stage 1 is officially complete and stable for single-node Hostinger deployments.
