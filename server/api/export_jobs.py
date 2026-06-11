from ..models import ExportStatus, ExportRequest, ExportJobStatus, _job_from_row
import asyncio
import json
import logging
import math
import os
import re
import time
import uuid
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import aiosqlite
from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from ..database import get_db
from ..headless_export import EXPORT_FPS, ExportStageError, export_headless
from ..progress import manager
from urllib.parse import quote
from ..storage import get_storage
from ..auth import get_current_user_optional
from ..usage import check_quota, record_usage_event
from ..settings import (
    AUTH_REQUIRED_FOR_EXPORT,
    EXPORT_DIR,
    DB_PATH,
    MAX_CONCURRENT_EXPORTS,
    MAX_EXPORT_DURATION_SECONDS,
    UPLOAD_DIR,
    ensure_runtime_dirs,
)
from .jobs import _public_export_stage, _resolve_export_dimensions
from ..export_queue import enqueue_export_job, get_export_history, retry_export_job, requeue_stale_processing_jobs
import time


router = APIRouter(prefix="/export/jobs", tags=["export"])
logger = logging.getLogger(__name__)

ensure_runtime_dirs()





async def _load_job_from_db(export_job_id: str) -> ExportJobStatus | None:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM export_jobs WHERE id = ?", (export_job_id,))
        row = await cursor.fetchone()
    return _job_from_row(row) if row else None



async def recover_orphaned_export_jobs() -> int:
    """Mark queued/running exports as failed after a process restart."""
    now = _utc_now()
    message = "Export worker restarted before this MP4 finished. Please start the export again."
    async with aiosqlite.connect(str(DB_PATH)) as db:
        cursor = await db.execute(
            """
            UPDATE export_jobs
            SET status = 'failed',
                stage = 'worker_restart',
                progress = -1,
                message = ?,
                error = ?,
                updated_at = ?
            WHERE status IN ('queued', 'running')
            """,
            (message, message, now),
        )
        await db.commit()
        return cursor.rowcount or 0


def _export_download_url(object_key: str) -> str:
    return f"/api/export/jobs/download?key={quote(object_key)}"


def _resolve_export_file(filename: str) -> Path:
    safe_name = Path(filename).name
    if safe_name != filename or not safe_name.lower().endswith(".mp4"):
        raise HTTPException(status_code=400, detail="Invalid export filename.")

    export_root = EXPORT_DIR.resolve()
    file_path = (export_root / safe_name).resolve()
    if export_root not in file_path.parents and file_path != export_root:
        raise HTTPException(status_code=400, detail="Invalid export path.")
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Export file was not found or has expired.")
    return file_path


def _dimensions_from_export_filename(filename: str, fallback_width: int, fallback_height: int) -> tuple[int, int]:
    match = re.search(r"_(\d+)x(\d+)\.mp4$", filename)
    if not match:
        return fallback_width, fallback_height
    return int(match.group(1)), int(match.group(2))


def _memory_mb() -> float | None:
    try:
        import resource

        usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return usage / 1024 if os.name != "nt" else usage / (1024 * 1024)
    except Exception:
        return None


def _stage_from_progress(status: str, details: str) -> str:
    combined = f"{status} {details}".lower()
    if "launch" in combined:
        return "renderer_launch"
    if "load" in combined or "composition" in combined:
        return "prepare_render_input"
    if "frame" in combined or "capture" in combined or status == "exporting":
        return "frame_capture"
    if "complete" in combined:
        return "completed"
    if "fail" in combined:
        return "failed"
    return status or "running"


async def _prune_jobs() -> None:
    cutoff = time.time() - 24 * 3600
    cutoff_iso = datetime.fromtimestamp(cutoff, timezone.utc).isoformat()
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            """
            DELETE FROM export_jobs
            WHERE status IN ('completed', 'failed') AND updated_at < ?
            """,
            (cutoff_iso,),
        )
        await db.commit()




def _validate_duration(duration: float | None) -> None:
    if duration is None or duration <= 0:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "stage": "determine_duration",
                "error": "Export duration is required. Use captions, timeline, sequence, or a custom duration.",
            },
        )
    if duration > MAX_EXPORT_DURATION_SECONDS:
        raise HTTPException(
            status_code=413,
            detail={
                "success": False,
                "stage": "validate_request",
                "error": (
                    f"Export duration {duration:.2f}s exceeds MAX_EXPORT_DURATION_SECONDS="
                    f"{MAX_EXPORT_DURATION_SECONDS}. Reduce duration/resolution or raise the env limit."
                ),
            },
        )


def export_job_metrics() -> dict[str, int]:
    return {
        "maxConcurrentExports": MAX_CONCURRENT_EXPORTS,
        "maxExportDurationSeconds": MAX_EXPORT_DURATION_SECONDS,
        "activeExports": 0,
        "queuedExports": 0,
        "trackedExportJobs": 0,
    }


@router.post("")
@router.post("/")
async def start_export_job(
    request: Request,
    db: aiosqlite.Connection = Depends(get_db),
    source_job_id: str = Form(...),
    captions_json: str = Form("[]"),
    theme: str = Form("word_highlight_box"),
    style_config_json: str | None = Form(None),
    resolution: str = Form("1080p"),
    export_width: int | None = Form(None),
    export_height: int | None = Form(None),
    export_fps: int = Form(EXPORT_FPS),
    include_audio: bool = Form(True),
    quality: str = Form("standard"),
    bitrate: str = Form("auto"),
    custom_bitrate_mbps: float | None = Form(None),
    export_mode: str = Form("full_video"),
    captions_only: bool = Form(False),
    background_color: str = Form("#101010"),
    duration_override: float | None = Form(None),
    duration_source: str | None = Form(None),
    duration_mode: str | None = Form(None),
    custom_duration: float | None = Form(None),
    visible_tracks_count: int | None = Form(None),
    source_media_count: int | None = Form(None),
    caption_chunks_count: int | None = Form(None),
    hardware_acceleration: bool = Form(False),
    render_mode: str = Form("headless"),
    composition_json: str | None = Form(None),
):
    user_context = await get_current_user_optional(request)
    if AUTH_REQUIRED_FOR_EXPORT and not user_context.is_authenticated:
        raise HTTPException(status_code=401, detail="Authentication required to export media.")
    
    # Do initial quota check
    # Note: we don't know the final length yet, but we will use duration_override
    quota_result = await check_quota(user_context, event_type="export", media_duration_sec=duration_override or 0)
    if not quota_result.allowed:
        raise HTTPException(status_code=402, detail=quota_result.reason)
    await _prune_jobs()
    if duration_override is None and custom_duration is not None:
        duration_override = custom_duration
    if duration_source is None and duration_mode is not None:
        duration_source = duration_mode
    _validate_duration(duration_override)

    export_fps = max(1, min(120, int(export_fps or EXPORT_FPS)))
    export_mode = "captions_only" if captions_only else export_mode
    if export_mode not in {"full_video", "captions_only", "captions_only_solid_background"}:
        return JSONResponse(
            {"success": False, "stage": "validate_request", "error": f"Unsupported export mode: {export_mode}"},
            status_code=400,
        )

    cursor = await db.execute("SELECT filename FROM jobs WHERE id = ?", (source_job_id,))
    row = await cursor.fetchone()
    if not row:
        return JSONResponse(
            {"success": False, "stage": "validate_project", "error": "Source caption job was not found."},
            status_code=404,
        )

    original_video_path = str(UPLOAD_DIR / f"{source_job_id}_{row['filename']}")
    is_captions_only = export_mode in {"captions_only", "captions_only_solid_background"}
    if not os.path.exists(original_video_path) and not is_captions_only:
        return JSONResponse(
            {
                "success": False,
                "stage": "resolve_media",
                "error": f"Source media file was not found for export: {original_video_path}",
            },
            status_code=404,
        )
    if not os.path.exists(original_video_path) and is_captions_only:
        include_audio = False

    request = ExportRequest(
        source_job_id=source_job_id,
        captions_json=captions_json,
        theme=theme,
        style_config_json=style_config_json,
        resolution=resolution,
        export_width=export_width,
        export_height=export_height,
        export_fps=export_fps,
        include_audio=include_audio,
        quality=quality,
        bitrate=bitrate,
        custom_bitrate_mbps=custom_bitrate_mbps,
        export_mode=export_mode,
        captions_only=captions_only,
        background_color=background_color,
        duration_override=duration_override,
        duration_source=duration_source,
        visible_tracks_count=visible_tracks_count,
        source_media_count=source_media_count,
        caption_chunks_count=caption_chunks_count,
        hardware_acceleration=hardware_acceleration,
        render_mode=render_mode,
        original_video_path=original_video_path,
        composition_json=composition_json,
    )

    export_job_id = str(uuid.uuid4())
    
    # Store usage record for export
    await record_usage_event(
        user_context=user_context,
        event_type="export",
        media_duration_sec=duration_override or 0,
        job_id=source_job_id,
        export_job_id=export_job_id
    )

    queued_job = await enqueue_export_job(
        source_job_id=source_job_id,
        user_id=user_context.user_id,
        anonymous_session_id=None,
        request=request,
        export_job_id=export_job_id
    )

    logger.info(
        "export_job_queued export_job_id=%s source_job_id=%s mode=%s duration=%s fps=%s captions=%s output_dir=%s",
        export_job_id,
        source_job_id,
        export_mode,
        duration_override,
        export_fps,
        caption_chunks_count,
        EXPORT_DIR,
    )

    return {
        "success": True,
        "jobId": export_job_id,
        "statusUrl": f"/api/export/jobs/{export_job_id}",
        "message": "Export queued",
    }


@router.get("")
@router.get("/")
async def list_export_jobs(request: Request):
    user_context = await get_current_user_optional(request)
    jobs = await get_export_history(user_context.user_id, user_context.anonymous_session_id, limit=50)
    return [job.to_public_dict() for job in jobs]

@router.post("/{export_job_id}/retry")
async def retry_job(export_job_id: str, request: Request):
    user_context = await get_current_user_optional(request)
    success, message = await retry_export_job(export_job_id, user_context.user_id, user_context.anonymous_session_id)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@router.get("/download")
async def download_export_file_signed(key: str):
    storage = get_storage()
    if not storage.exists(key):
        raise HTTPException(status_code=404, detail="Export file was not found or has expired.")
    
    url = storage.get_url(key)
    if url:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url)
    raise HTTPException(status_code=500, detail="Could not generate download link.")

@router.get("/download/{filename}")
async def download_export_file(filename: str):
    file_path = _resolve_export_file(filename)
    return FileResponse(
        file_path,
        media_type="video/mp4",
        filename=file_path.name,
        headers={
            "Content-Disposition": f'attachment; filename="{file_path.name}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=86400",
        },
    )


@router.get("/{export_job_id}")
async def get_export_job(export_job_id: str):
    job = await _load_job_from_db(export_job_id)
    if job:
        return job.to_public_dict()
    raise HTTPException(status_code=404, detail="Export job not found")

    if job.status in {"queued", "running"}:
        message = "Export worker restarted before this MP4 finished. Please start the export again."
        job.status = "failed"
        job.stage = "worker_restart"
        job.progress = -1
        job.message = message
        job.error = message
        job.updated_at = _utc_now()
        await _persist_job(job)

    return job.to_public_dict()
