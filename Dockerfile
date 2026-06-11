FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /app/frontend
ENV NEXT_PUBLIC_API_BASE_URL=
ENV NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_APP_URL=
ENV NEXT_OUTPUT=export
ENV NEXT_TELEMETRY_DISABLED=1

COPY frontend/package*.json ./
RUN npm ci --include=dev

COPY frontend ./
ENV NODE_ENV=production
RUN npm run build


FROM python:3.11-slim AS app

ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV TEMP_DIR=/data/tmp
ENV UPLOAD_DIR=/data/uploads
ENV EXPORT_DIR=/data/exports
ENV DB_PATH=/data/database.sqlite
ENV RUNTIME_CLEANUP_HOURS=24
ENV EXPORT_CONCURRENCY=1
ENV MAX_CONCURRENT_EXPORTS=1
ENV MAX_EXPORT_DURATION_SECONDS=300
ENV EXPORT_BROWSER_TIMEOUT_MS=180000
ENV EXPORT_FRAME_TIMEOUT_MS=30000
ENV EXPORT_MAX_RETRIES=2
ENV EXPORT_RENDER_SAFE_MODE=true
ENV EXPORT_MAX_LONG_EDGE=1080
ENV EXPORT_MAX_FPS=30
ENV EXPORT_DEFAULT_FPS=30
ENV EXPORT_ENABLE_LAYER_PREFLIGHT=true
ENV EXPORT_LAYERED_RENDER_PAGE_RECYCLE_FRAMES=240
ENV EXPORT_SAFE_QUALITY=standard
ENV EXPORT_FFMPEG_THREADS=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    libsndfile1 \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python -m pip install --upgrade pip \
  && python -m pip install -r requirements.txt \
  && python -m playwright install --with-deps chromium

COPY . .
COPY --from=frontend-builder /app/frontend/out ./frontend/out

VOLUME ["/data"]

EXPOSE 10000

CMD ["sh", "-c", "uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
