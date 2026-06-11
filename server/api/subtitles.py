import os
import json
import logging
import uuid
from typing import Any, List

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

from ..settings import ensure_runtime_dirs
from ..database import get_db
import aiosqlite
from ai_pipeline.subtitle_import import parse_subtitle_file, SubtitleImportError
from ai_pipeline.language_modes import normalize_language_mode, SUPPORTED_LANGUAGE_MODES

router = APIRouter(prefix="/subtitles", tags=["subtitles"])
logger = logging.getLogger(__name__)

ensure_runtime_dirs()

ALLOWED_SUBTITLE_EXTENSIONS = {".srt", ".vtt", ".ass"}


class SubtitleImportResponse(BaseModel):
    job_id: str
    captions: List[dict[str, Any]]
    transcript: dict[str, Any]
    report: dict[str, Any]


@router.post("/import", response_model=SubtitleImportResponse)
async def import_subtitle_file(
    file: UploadFile = File(...),
    languageMode: str = Form("auto_mixed_indian"),
    scriptMode: str = Form("imported"),
):
    """
    Import an SRT, VTT, or ASS subtitle file and convert it to the CaptionDocument format.
    No STT provider required.
    """
    job_id = str(uuid.uuid4())
    filename = os.path.basename(file.filename or "")
    ext = os.path.splitext(filename)[1].lower()

    if ext not in ALLOWED_SUBTITLE_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_SUBTITLE_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported subtitle format '{ext}'. Supported: {allowed}",
        )

    try:
        normalized_mode = normalize_language_mode(languageMode)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"{exc} Supported modes: {', '.join(SUPPORTED_LANGUAGE_MODES)}.",
        )

    # Read file content
    try:
        content_bytes = await file.read()
        content = content_bytes.decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read subtitle file: {e}")
    finally:
        await file.close()

    # Parse subtitle file
    try:
        captions, report = parse_subtitle_file(
            content=content,
            filename=filename,
            language_mode=normalized_mode,
            script_mode=scriptMode,
        )
    except SubtitleImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as e:
        logger.exception("subtitle_import_failed")
        raise HTTPException(status_code=500, detail=f"Subtitle import failed: {e}")

    # Build transcript in the same shape as STT generation
    segments = [
        {
            "id": caption.get("id"),
            "start": caption.get("start"),
            "end": caption.get("end"),
            "text": caption.get("text"),
            "words": caption.get("words", []),
        }
        for caption in captions
    ]

    aligned_words = []
    for caption in captions:
        aligned_words.extend(caption.get("words", []))

    transcript = {
        "languageMode": normalized_mode,
        "provider": "subtitle_import",
        "romanized": False,
        "segments": segments,
        "alignedWords": aligned_words,
        "metadata": {
            "importReport": report,
            "source": "subtitle_import",
        },
    }

    return SubtitleImportResponse(
        job_id=job_id,
        captions=captions,
        transcript=transcript,
        report=report,
    )


@router.get("/health")
async def subtitles_health():
    return {"status": "ok", "service": "subtitles"}
