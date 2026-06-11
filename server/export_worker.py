import asyncio
import json
import logging
import math
import os
import re
from pathlib import Path

from .models import ExportRequest, ExportJobStatus
from .headless_export import ExportStageError, export_headless
from .storage import get_storage
from .export_queue import mark_export_stage, mark_export_completed, mark_export_failed
from .settings import EXPORT_DIR

logger = logging.getLogger(__name__)

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

def _public_export_stage(internal_stage: str) -> str:
    from .api.jobs import _public_export_stage as _pub
    return _pub(internal_stage)

async def _run_export_job_sync(job: ExportJobStatus, request: ExportRequest) -> None:
    export_job_id = job.id
    started_memory = _memory_mb()
    logger.info(
        "export_job_started export_job_id=%s source_job_id=%s mode=%s render_mode=%s duration=%s fps=%s size=%sx%s memory_mb=%s",
        export_job_id, request.source_job_id, request.export_mode, request.render_mode,
        request.duration_override, request.export_fps, request.export_width, request.export_height, started_memory,
    )

    async def progress_cb(status: str, percent: int, details: str):
        stage = _stage_from_progress(status, details)
        progress = max(0, min(99, int(percent)))
        await mark_export_stage(export_job_id, "running", stage, progress, details or stage)

    try:
        if request.render_mode != "headless":
            raise ExportStageError("validate_request", "Background export jobs currently support headless MP4 export only.")
        if not request.captions_json or not request.captions_json.strip():
            raise ExportStageError("render_input", "No captions JSON was provided for MP4 export.")

        try:
            parsed_captions = json.loads(request.captions_json)
        except json.JSONDecodeError as exc:
            raise ExportStageError("render_input", "Invalid captions JSON sent to export.", exc) from exc
        if not isinstance(parsed_captions, list):
            raise ExportStageError("render_input", "Captions JSON must be a list of caption chunks.")

        duration = float(request.duration_override or 0)
        total_frames = math.ceil(duration * request.export_fps) if duration > 0 else None

        output_path = await export_headless(
            job_id=export_job_id,
            video_path=request.original_video_path,
            captions_json=request.captions_json,
            theme=request.theme,
            resolution=request.resolution,
            progress_callback=progress_cb,
            style_config_json=request.style_config_json,
            export_width=request.export_width,
            export_height=request.export_height,
            export_fps=request.export_fps,
            include_audio=request.include_audio,
            quality=request.quality,
            bitrate=request.bitrate,
            custom_bitrate_mbps=request.custom_bitrate_mbps,
            export_mode=request.export_mode,
            background_color=request.background_color,
            duration_override=request.duration_override,
            duration_source=request.duration_source,
            hardware_acceleration=request.hardware_acceleration,
            composition_json=request.composition_json,
        )

        output = Path(output_path)
        output_bytes = output.stat().st_size if output.exists() else 0
        if output_bytes <= 0:
            raise ExportStageError("output_write", f"FFmpeg finished but output file is missing or empty: {output_path}")

        # Upload to Storage Adapter
        storage = get_storage()
        object_key = f"exports/{export_job_id}/{output.name}"
        try:
            stored_obj = await asyncio.to_thread(
                storage.save_file,
                output,
                object_key,
                "video/mp4",
                {"export_job_id": export_job_id, "source_job_id": request.source_job_id}
            )
            # Delete local file if upload is successful
            if output.exists() and storage.backend_name != "local":
                output.unlink(missing_ok=True)
        except Exception as e:
            logger.error(f"Failed to upload export to storage: {e}")
            object_key = output.name

        from .api.jobs import _resolve_export_dimensions
        fallback_width, fallback_height = _resolve_export_dimensions(
            request.resolution, request.export_width, request.export_height,
        )
        width, height = _dimensions_from_export_filename(output.name, fallback_width, fallback_height)
        
        from urllib.parse import quote
        download_url = f"/api/export/jobs/download?key={quote(object_key)}"
        
        await mark_export_completed(
            job_id=export_job_id,
            storage_backend=storage.backend_name,
            object_key=object_key,
            download_url=download_url,
            filename=output.name,
            output_path=str(output),
            bytes_size=output_bytes,
            width=width,
            height=height
        )
        logger.info(
            "export_job_completed export_job_id=%s source_job_id=%s output=%s bytes=%s memory_mb=%s",
            export_job_id, request.source_job_id, output, output_bytes, _memory_mb(),
        )
    except ExportStageError as exc:
        public_stage = _public_export_stage(exc.stage)
        message = str(exc)
        await mark_export_failed(export_job_id, public_stage, f"Export failed during {public_stage}: {message}", message)
        logger.exception("export_job_failed export_job_id=%s stage=%s error=%s", export_job_id, exc.stage, message)
    except Exception as exc:
        message = str(exc).strip() or repr(exc) or type(exc).__name__
        await mark_export_failed(export_job_id, "render_video", f"Export failed during render_video: {type(exc).__name__}: {message}", f"{type(exc).__name__}: {message}")
        logger.exception("export_job_failed_unexpected export_job_id=%s error=%s", export_job_id, message)
