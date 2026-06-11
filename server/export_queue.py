import aiosqlite
import json
import logging
import uuid
import time
from datetime import datetime, timezone
from dataclasses import asdict

from .settings import DB_PATH
from .models import ExportRequest, ExportJobStatus, _job_from_row

logger = logging.getLogger(__name__)

def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()

async def enqueue_export_job(
    source_job_id: str,
    user_id: str | None,
    anonymous_session_id: str | None,
    request: ExportRequest,
    export_job_id: str
) -> ExportJobStatus:
    request_payload = json.dumps(asdict(request))
    now = _utc_now()
    
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            """
            INSERT INTO export_jobs (
                id, source_job_id, user_id, anonymous_session_id, status, stage, progress, 
                message, duration, width, height, fps, created_at, updated_at, request_payload,
                attempts, max_attempts
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                export_job_id,
                source_job_id,
                user_id,
                anonymous_session_id,
                "queued",
                "queued",
                0,
                "Waiting for an available export worker...",
                float(request.duration_override or 0),
                request.export_width,
                request.export_height,
                request.export_fps,
                now,
                now,
                request_payload,
                0,
                2 # default max_attempts
            )
        )
        await db.commit()
        
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM export_jobs WHERE id = ?", (export_job_id,))
        row = await cursor.fetchone()
        return _job_from_row(row)

async def claim_next_export_job(worker_id: str) -> tuple[ExportJobStatus | None, ExportRequest | None]:
    """Atomically claim a queued export job for processing."""
    now = _utc_now()
    
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        
        # SQLite doesn't have true UPDATE ... RETURNING with limits that easily in older versions,
        # so we do a transaction.
        await db.execute("BEGIN IMMEDIATE")
        
        # Find oldest queued job
        cursor = await db.execute(
            "SELECT id, request_payload FROM export_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
        )
        row = await cursor.fetchone()
        
        if not row:
            await db.execute("COMMIT")
            return None, None
            
        job_id = row["id"]
        request_payload = row["request_payload"]
        
        await db.execute(
            """
            UPDATE export_jobs 
            SET status = 'running', stage = 'prepare_render_input', progress = 1, 
                message = 'Preparing render input...', updated_at = ?, started_at = ?,
                locked_at = ?, locked_by = ?, attempts = attempts + 1
            WHERE id = ?
            """,
            (now, now, now, worker_id, job_id)
        )
        await db.commit() # This commits the BEGIN IMMEDIATE
        
        # Fetch the updated job
        cursor = await db.execute("SELECT * FROM export_jobs WHERE id = ?", (job_id,))
        updated_row = await cursor.fetchone()
        
        job = _job_from_row(updated_row)
        request = ExportRequest(**json.loads(request_payload)) if request_payload else None
        return job, request

async def mark_export_stage(job_id: str, status: str, stage: str, progress: int, message: str) -> None:
    now = _utc_now()
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            """
            UPDATE export_jobs 
            SET status = ?, stage = ?, progress = ?, message = ?, updated_at = ?
            WHERE id = ?
            """,
            (status, stage, progress, message, now, job_id)
        )
        await db.commit()

async def mark_export_completed(
    job_id: str, 
    storage_backend: str, 
    object_key: str, 
    download_url: str, 
    filename: str, 
    output_path: str, 
    bytes_size: int,
    width: int,
    height: int
) -> None:
    now = _utc_now()
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            """
            UPDATE export_jobs 
            SET status = 'completed', stage = 'completed', progress = 100, 
                message = 'MP4 export is ready to download.', error = NULL,
                storage_backend = ?, object_key = ?, download_url = ?, filename = ?,
                output_path = ?, bytes = ?, width = ?, height = ?, updated_at = ?, completed_at = ?,
                locked_by = NULL, locked_at = NULL
            WHERE id = ?
            """,
            (storage_backend, object_key, download_url, filename, output_path, bytes_size, width, height, now, now, job_id)
        )
        await db.commit()

async def mark_export_failed(job_id: str, public_stage: str, message: str, error: str) -> None:
    now = _utc_now()
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            """
            UPDATE export_jobs 
            SET status = 'failed', stage = ?, progress = -1, message = ?, error = ?, 
                updated_at = ?, locked_by = NULL, locked_at = NULL
            WHERE id = ?
            """,
            (public_stage, message, error, now, job_id)
        )
        await db.commit()

async def get_export_history(user_id: str | None, anonymous_session_id: str | None, limit: int = 50) -> list[ExportJobStatus]:
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        
        if user_id:
            cursor = await db.execute(
                "SELECT * FROM export_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
                (user_id, limit)
            )
        elif anonymous_session_id:
            cursor = await db.execute(
                "SELECT * FROM export_jobs WHERE anonymous_session_id = ? ORDER BY created_at DESC LIMIT ?",
                (anonymous_session_id, limit)
            )
        else:
            return []
            
        rows = await cursor.fetchall()
        return [_job_from_row(row) for row in rows]

async def requeue_stale_processing_jobs(max_age_minutes: int = 30) -> int:
    cutoff = time.time() - (max_age_minutes * 60)
    cutoff_iso = datetime.fromtimestamp(cutoff, timezone.utc).isoformat()
    now = _utc_now()
    
    async with aiosqlite.connect(str(DB_PATH)) as db:
        cursor = await db.execute(
            """
            UPDATE export_jobs
            SET status = 'queued', stage = 'queued', progress = 0, 
                message = 'Export worker restarted; requeued job.',
                error = NULL, locked_by = NULL, locked_at = NULL, updated_at = ?
            WHERE status = 'running' AND (updated_at < ? OR locked_at < ?)
            """,
            (now, cutoff_iso, cutoff_iso)
        )
        await db.commit()
        return cursor.rowcount or 0

async def retry_export_job(job_id: str, user_id: str | None, anonymous_session_id: str | None) -> tuple[bool, str]:
    now = _utc_now()
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM export_jobs WHERE id = ?", (job_id,))
        row = await cursor.fetchone()
        
        if not row:
            return False, "Export job not found."
            
        row_dict = dict(row)
            
        if user_id and row_dict.get("user_id") != user_id:
            return False, "Unauthorized"
        if anonymous_session_id and not user_id and row_dict.get("anonymous_session_id") != anonymous_session_id:
            return False, "Unauthorized"
            
        if row_dict["status"] not in ["failed", "completed"]:
            return False, "Only failed or completed jobs can be retried."
            
        if int(row_dict.get("attempts") or 0) >= int(row_dict.get("max_attempts") or 2):
            return False, "Maximum retry attempts exceeded."
            
        await db.execute(
            """
            UPDATE export_jobs
            SET status = 'queued', stage = 'queued', progress = 0, message = 'Job requeued for retry.',
                error = NULL, updated_at = ?, locked_by = NULL, locked_at = NULL
            WHERE id = ?
            """,
            (now, job_id)
        )
        await db.commit()
        return True, "Job successfully queued for retry."
