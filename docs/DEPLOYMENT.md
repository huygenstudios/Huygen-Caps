# Deployment

Huygen Caps is production-deployed as one Docker web service. FastAPI serves both the API and the exported Next.js frontend.

## Render.com

Use `render.yaml` as the blueprint.

Render service details:

- Type: web service
- Runtime: Docker
- Dockerfile: `./Dockerfile`
- Health check path: `/health`
- Start command: handled by Docker CMD
- Required port behavior: bind to `0.0.0.0:$PORT`

The Docker CMD is:

```sh
uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-10000}
```

## Required Render Env Vars

Set these in the Render dashboard:

```env
NODE_ENV=production
STT_PROVIDER=auto
MAX_UPLOAD_SIZE_MB=500
PUBLIC_APP_URL=<your public app URL>
CORS_ORIGINS=<comma-separated allowed frontend origins>
EXPORT_CONCURRENCY=1
MAX_CONCURRENT_EXPORTS=1
MAX_EXPORT_DURATION_SECONDS=300
EXPORT_BROWSER_TIMEOUT_MS=180000
EXPORT_FRAME_TIMEOUT_MS=30000
EXPORT_MAX_RETRIES=2
EXPORT_DEFAULT_FPS=60
EXPORT_MAX_FPS=60
EXPORT_ENABLE_LAYER_PREFLIGHT=true
EXPORT_RENDER_SAFE_MODE=true
EXPORT_MAX_LONG_EDGE=1920
EXPORT_FFMPEG_THREADS=1
TEMP_DIR=/tmp/huygen-caps
UPLOAD_DIR=/tmp/huygen-caps/uploads
EXPORT_DIR=/tmp/huygen-caps/exports
DB_PATH=/tmp/huygen-caps/database.sqlite
RUNTIME_CLEANUP_HOURS=24
ALIGNMENT_PROVIDER=auto
ENABLE_WHISPERX=false
ENABLE_STABLE_TS=false
ENABLE_SILERO_VAD=false
PAUSE_SPLIT_THRESHOLD=0.45
DEFAULT_GLOBAL_CAPTION_OFFSET=0
```

Set at least one provider key:

```env
SARVAM_API_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=
```

Do not commit real `.env` files or secrets. Set production values in the Render dashboard. For the single-service Docker deployment, leave `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_API_URL` blank so the frontend calls same-origin `/api/*`; this avoids production browsers calling `localhost` or `127.0.0.1`.

## Separate Frontend/Backend Deployment

Only use a separate frontend service if you intentionally split the app. In that case:

- Backend Render service URL goes into frontend `NEXT_PUBLIC_API_BASE_URL` or the legacy `NEXT_PUBLIC_API_URL`.
- The public API base must be an HTTPS backend URL, not localhost.
- Backend `CORS_ORIGINS` must include the frontend URL.
- Backend still binds to `0.0.0.0:$PORT`.

## Health Checks

Render health check:

```text
/health
```

Manual checks:

```text
https://YOUR_RENDER_SERVICE.onrender.com/health
https://YOUR_RENDER_SERVICE.onrender.com/health/export
https://YOUR_RENDER_SERVICE.onrender.com/health/timing
```

`/health/export` may be `degraded` if FFmpeg, FFprobe, Playwright, Chromium, or writable temp/export dirs are unavailable.
`/health/timing` reports WhisperX, stable-ts, Silero VAD, FFmpeg, and FFprobe availability. Optional alignment packages are disabled by default on Render; fallback word timings are marked as `estimated`.

## Common Render Issues

No open ports detected:

- The app is not binding to `0.0.0.0`.
- The app is not using Render's `$PORT`.
- Fix is the Docker CMD already in this repo.

Frontend calls localhost:

- Leave `NEXT_PUBLIC_API_URL` blank for the single Docker service.
- If split deployment, set it to the backend Render HTTPS URL.

Export fails on Render:

- Check `/health/export`.
- Confirm FFmpeg/FFprobe are installed in the Docker image.
- Confirm Chromium launches.
- Confirm `/tmp/huygen-caps/exports` is writable.
- Confirm the UI is using `/api/export/jobs`, not holding a long `/api/jobs/{id}/export` POST open.
- Check `activeExports` and `queuedExports`; keep `MAX_CONCURRENT_EXPORTS=1` on small instances.
- If export reaches frame capture and then Render shows `502`, inspect logs for service restart or memory pressure and reduce duration/resolution/FPS or upgrade the plan.

Ephemeral files disappear:

- Render web service disk is ephemeral.
- Exports are available only while the instance keeps the file.
- Add S3/R2 for durable storage later.
