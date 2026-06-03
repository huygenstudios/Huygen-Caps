import json
from collections import Counter
from typing import Any

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException

from ..database import get_db
from ai_pipeline.timing import DEFAULT_PAUSE_SPLIT_THRESHOLD, build_timing_report, normalize_timing_source

router = APIRouter(prefix="/captions/jobs", tags=["captions"])


def _load_json(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return fallback


def _caption_chunks_from_segments(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    for segment in segments:
        words = segment.get("words") or []
        chunks.append({
            "start": segment.get("start"),
            "end": segment.get("end"),
            "text": segment.get("text", ""),
            "wordCount": len(words),
        })
    return chunks


@router.get("/{job_id}/timing-debug")
async def timing_debug(job_id: str, db: aiosqlite.Connection = Depends(get_db)):
    cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    transcript = _load_json(row["transcript_json"] if "transcript_json" in row.keys() else None, None)
    segments = []
    metadata: dict[str, Any] = {}
    if transcript:
        segments = transcript.get("segments") or []
        metadata = transcript.get("metadata") or {}
    if not segments:
        segments = _load_json(row["segments_json"], [])

    words: list[dict[str, Any]] = []
    source_counts: Counter[str] = Counter()
    for segment in segments:
        for word in segment.get("words") or []:
            source = normalize_timing_source(word.get("timingSource") or word.get("timing_source"), word.get("provider"))
            source_counts[source] += 1
            words.append({
                "word": word.get("displayedWord") or word.get("word") or word.get("originalWord"),
                "start": word.get("start"),
                "end": word.get("end"),
                "timingSource": source,
                "confidence": word.get("confidence", word.get("score")),
            })

    timing_meta = metadata.get("timing") if isinstance(metadata.get("timing"), dict) else {}
    vad = timing_meta.get("vad") if isinstance(timing_meta.get("vad"), dict) else {}
    silence_gaps = vad.get("silenceGaps") if isinstance(vad.get("silenceGaps"), list) else []
    report = timing_meta.get("report") if isinstance(timing_meta.get("report"), dict) else build_timing_report(segments, silence_gaps)

    return {
        "jobId": job_id,
        "status": row["status"],
        "wordCount": len(words),
        "chunkCount": len(segments),
        "timingSourceCounts": dict(source_counts) or report.get("timingSourceCounts", {}),
        "silenceGaps": silence_gaps,
        "suspiciousTimingWarnings": report.get("warnings", []),
        "chunks": _caption_chunks_from_segments(segments)[:200],
        "first20Words": words[:20],
        "pauseThresholdUsed": vad.get("thresholdSeconds") or DEFAULT_PAUSE_SPLIT_THRESHOLD,
        "report": report,
    }
