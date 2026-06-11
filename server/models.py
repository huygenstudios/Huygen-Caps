from typing import Literal
from dataclasses import dataclass, field
from datetime import datetime, timezone
import aiosqlite
from pydantic import BaseModel
from typing import Any, Optional, List

class AlignedWord(BaseModel):
    word: str
    start: float
    end: float
    score: float = 0.0
    confidence: Optional[float] = None
    provider: Optional[str] = None
    timing_source: Optional[str] = None
    originalWord: Optional[str] = None
    languageHint: Optional[str] = None
    timing_repair: Optional[str] = None

class AlignedSegment(BaseModel):
    id: Optional[str] = None
    start: float
    end: float
    text: str
    words: Optional[List[AlignedWord]] = None

class JobResponse(BaseModel):
    job_id: str
    status: str
    progress: int
    filename: str
    target_lang: str
    languageMode: str
    video_url: Optional[str] = None
    media_kind: str = "video"

class JobDetailResponse(BaseModel):
    job_id: str
    status: str
    progress: int
    filename: str
    target_lang: str
    languageMode: str
    error: Optional[str] = None
    srt: Optional[str] = None
    vtt: Optional[str] = None
    segments: Optional[List[AlignedSegment]] = None
    transcript: Optional[dict[str, Any]] = None
    output_video_url: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    media_kind: str = "video"

ExportStatus = Literal["queued", "running", "completed", "failed"]
_EXPORT_JOB_COLUMNS = (
    "id",
    "source_job_id",
    "user_id",
    "anonymous_session_id",
    "storage_backend",
    "object_key",
    "status",
    "stage",
    "progress",
    "message",
    "error",
    "download_url",
    "filename",
    "output_path",
    "bytes",
    "duration",
    "width",
    "height",
    "fps",
    "created_at",
    "updated_at",
)


@dataclass
class ExportRequest:
    source_job_id: str
    captions_json: str
    theme: str
    style_config_json: str | None
    resolution: str
    export_width: int | None
    export_height: int | None
    export_fps: int
    include_audio: bool
    quality: str
    bitrate: str
    custom_bitrate_mbps: float | None
    export_mode: str
    captions_only: bool
    background_color: str
    duration_override: float | None
    duration_source: str | None
    visible_tracks_count: int | None
    source_media_count: int | None
    caption_chunks_count: int | None
    hardware_acceleration: bool
    render_mode: str
    original_video_path: str
    composition_json: str | None


@dataclass
class ExportJobStatus:
    id: str
    source_job_id: str
    status: ExportStatus
    stage: str
    progress: int
    user_id: str | None = None
    anonymous_session_id: str | None = None
    storage_backend: str | None = None
    object_key: str | None = None
    message: str = ""
    error: str | None = None
    download_url: str | None = None
    filename: str | None = None
    output_path: str | None = None
    bytes: int | None = None
    duration: float | None = None
    width: int | None = None
    height: int | None = None
    fps: int | None = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_public_dict(self) -> dict[str, object]:
        return {
            "jobId": self.id,
            "sourceJobId": self.source_job_id,
            "userId": self.user_id,
            "storageBackend": self.storage_backend,
            "status": self.status,
            "stage": self.stage,
            "progress": self.progress,
            "message": self.message,
            "error": self.error,
            "downloadUrl": self.download_url,
            "filename": self.filename,
            "bytes": self.bytes,
            "duration": self.duration,
            "width": self.width,
            "height": self.height,
            "fps": self.fps,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _job_db_values(job: ExportJobStatus) -> tuple[object, ...]:
    return (
        job.id,
        job.source_job_id,
        job.user_id,
        job.anonymous_session_id,
        job.storage_backend,
        job.object_key,
        job.status,
        job.stage,
        job.progress,
        job.message,
        job.error,
        job.download_url,
        job.filename,
        job.output_path,
        job.bytes,
        job.duration,
        job.width,
        job.height,
        job.fps,
        job.created_at,
        job.updated_at,
    )


def _job_from_row(row: aiosqlite.Row) -> ExportJobStatus:
    row_dict = dict(row)
    return ExportJobStatus(
        id=row_dict["id"],
        source_job_id=row_dict["source_job_id"],
        user_id=row_dict.get("user_id"),
        anonymous_session_id=row_dict.get("anonymous_session_id"),
        storage_backend=row_dict.get("storage_backend"),
        object_key=row_dict.get("object_key"),
        status=row_dict["status"],
        stage=row_dict["stage"],
        progress=int(row_dict.get("progress") or 0),
        message=row_dict.get("message") or "",
        error=row_dict.get("error"),
        download_url=row_dict.get("download_url"),
        filename=row_dict.get("filename"),
        output_path=row_dict.get("output_path"),
        bytes=row_dict.get("bytes"),
        duration=row_dict.get("duration"),
        width=row_dict.get("width"),
        height=row_dict.get("height"),
        fps=row_dict.get("fps"),
        created_at=row_dict["created_at"],
        updated_at=row_dict["updated_at"],
    )