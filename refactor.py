import re

with open('server/api/export_jobs.py', 'r') as f:
    code = f.read()

# 1. Imports
if 'from ..export_queue import' not in code:
    code = code.replace('from .jobs import _public_export_stage, _resolve_export_dimensions', 'from .jobs import _public_export_stage, _resolve_export_dimensions\nfrom ..export_queue import enqueue_export_job, get_export_history, retry_export_job, requeue_stale_processing_jobs\nimport time')

# 2. _jobs, _export_semaphore, _jobs_lock
code = re.sub(r'_export_semaphore = asyncio\.Semaphore\(MAX_CONCURRENT_EXPORTS\)\n', '', code)
code = re.sub(r'_jobs_lock = asyncio\.Lock\(\)\n', '', code)
code = re.sub(r'_jobs: dict\[str, "ExportJobStatus"\] = \{\}\n', '', code)

# 3. Prune jobs
# We remove the memory dictionary logic from prune_jobs
prune_replacement = """async def _prune_jobs() -> None:
    cutoff = time.time() - 24 * 3600
    cutoff_iso = datetime.fromtimestamp(cutoff, timezone.utc).isoformat()
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute(
            \"\"\"
            DELETE FROM export_jobs
            WHERE status IN ('completed', 'failed') AND updated_at < ?
            \"\"\",
            (cutoff_iso,),
        )
        await db.commit()"""

code = re.sub(r'async def _prune_jobs\(\) -> None:.*?await db\.commit\(\)', prune_replacement, code, flags=re.DOTALL)

# 4. Remove memory methods
code = re.sub(r'async def _set_job\(.*?\n\n', '', code, flags=re.DOTALL)
code = re.sub(r'async def _broadcast_progress\(.*?\n\n', '', code, flags=re.DOTALL)
code = re.sub(r'async def _persist_job\(.*?\n\n', '', code, flags=re.DOTALL)
code = re.sub(r'async def _load_recent_jobs_from_db\(.*?\n\n', '', code, flags=re.DOTALL)

# 5. Remove _run_export_job
code = re.sub(r'async def _run_export_job\(.*?\n\n\ndef export_job_metrics', 'def export_job_metrics', code, flags=re.DOTALL)

# 6. Update export_job_metrics
metric_replacement = """def export_job_metrics() -> dict[str, int]:
    return {
        "maxConcurrentExports": MAX_CONCURRENT_EXPORTS,
        "maxExportDurationSeconds": MAX_EXPORT_DURATION_SECONDS,
        "activeExports": 0,
        "queuedExports": 0,
        "trackedExportJobs": 0,
    }"""
code = re.sub(r'def export_job_metrics\(\) -> dict\[str, int\]:.*?\n\n', metric_replacement + '\n\n', code, flags=re.DOTALL)

# 7. Update start_export_job to use queue
start_export_replacement = """    export_job_id = str(uuid.uuid4())
    
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
    }"""
code = re.sub(r'    export_job_id = str\(uuid\.uuid4\(\)\).*?return \{\n.*?"message": "Export started",\n    \}', start_export_replacement, code, flags=re.DOTALL)

# 8. Update list_export_jobs and get_export_job
list_export_replacement = """@router.get("")
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
    return {"success": True, "message": message}"""
code = re.sub(r'@router\.get\(""\)\n@router\.get\("/"\)\nasync def list_export_jobs\(\):\n.*?return \[job\.to_public_dict\(\) for job in jobs\]', list_export_replacement, code, flags=re.DOTALL)

get_export_replacement = """@router.get("/{export_job_id}")
async def get_export_job(export_job_id: str):
    job = await _load_job_from_db(export_job_id)
    if job:
        return job.to_public_dict()
    raise HTTPException(status_code=404, detail="Export job not found")"""
code = re.sub(r'@router\.get\("/\{export_job_id\}"\)\nasync def get_export_job\(export_job_id: str\):.*?\n\s+raise HTTPException\(status_code=404, detail="Export job not found"\)', get_export_replacement, code, flags=re.DOTALL)

with open('server/api/export_jobs.py', 'w') as f:
    f.write(code)
