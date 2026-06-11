import os
import re
import logging
from pathlib import Path
from typing import Any, TypedDict

from .language_modes import normalize_language_mode

logger = logging.getLogger(__name__)

DEFAULT_MAX_SUBTITLE_IMPORT_BYTES = 2 * 1024 * 1024
SUPPORTED_IMPORT_EXTENSIONS = {".srt", ".vtt", ".ass"}

_VTT_TIMING_RE = re.compile(
    r"(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*"
    r"(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})"
)
_ASS_OVERRIDE_RE = re.compile(r"\{\\[^}]*\}")
_HTML_TAG_RE = re.compile(r"<[^>]*>")
_ASS_DIALOGUE_RE = re.compile(r"^Dialogue:\s*(.*)", re.IGNORECASE)
_ASS_FORMAT_RE = re.compile(r"^Format:\s*(.*)", re.IGNORECASE)
_VTT_NOTE_RE = re.compile(r"^NOTE\s", re.IGNORECASE)

class SubtitleImportError(Exception):
    pass


class ImportReport(TypedDict, total=False):
    format: str
    caption_count: int
    skipped_blocks: int
    warnings: list[str]
    duration_start: float
    duration_end: float
    has_estimated_word_timings: bool


def _srt_time_to_seconds(hours: str, minutes: str, seconds: str, millis: str) -> float:
    h = int(hours)
    m = int(minutes)
    s = int(seconds)
    ms = int(millis.ljust(3, "0")[:3])
    return h * 3600.0 + m * 60.0 + s + ms / 1000.0


def _vtt_time_to_seconds(hours: str, minutes: str, seconds: str, millis: str) -> float:
    return _srt_time_to_seconds(hours, minutes, seconds, millis)


def _strip_html(text: str) -> str:
    return _HTML_TAG_RE.sub("", text).strip()


def _strip_ass_tags(text: str) -> str:
    return _ASS_OVERRIDE_RE.sub("", text).strip()


def _estimate_word_timings(text: str, start: float, end: float) -> list[dict[str, Any]]:
    words = text.strip().split()
    if not words or end <= start:
        return []
    duration = end - start
    step = duration / len(words)
    estimated: list[dict[str, Any]] = []
    for i, word_text in enumerate(words):
        w_start = round(start + i * step, 3)
        w_end = round(start + (i + 1) * step, 3) if i < len(words) - 1 else round(end, 3)
        estimated.append({
            "word": word_text.lower(),
            "displayedWord": word_text,
            "originalWord": word_text,
            "spokenWord": word_text,
            "start": w_start,
            "end": w_end,
            "score": 0.0,
            "timing_source": "estimated_from_subtitle",
            "timingSource": "estimated",
            "timingNeedsReview": True,
            "timingReviewRequired": True,
        })
    return estimated

def _parse_srt(content: str) -> tuple[list[dict[str, Any]], ImportReport]:
    captions: list[dict[str, Any]] = []
    warnings: list[str] = []
    skipped = 0
    duration_start: float | None = None
    duration_end: float | None = None

    for block in re.split(r"\n\s*\n", content.strip()):
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue

        try:
            match = _VTT_TIMING_RE.search(lines[1] if len(lines) > 1 else "")
            if not match:
                warnings.append(f"Block starting '{lines[0][:40]}' has invalid timing, skipped.")
                skipped += 1
                continue

            start = _srt_time_to_seconds(match.group(1), match.group(2), match.group(3), match.group(4))
            end = _srt_time_to_seconds(match.group(5), match.group(6), match.group(7), match.group(8))
            text = _strip_html(" ".join(lines[2:]) if len(lines) > 2 else "").strip()
            if not text:
                warnings.append(f"Cue {lines[0]} has no text, skipped.")
                skipped += 1
                continue
            if start >= end:
                warnings.append(f"Cue {lines[0]} has inverted timing, skipped.")
                skipped += 1
                continue

            if duration_start is None:
                duration_start = start
            duration_end = end

            captions.append({
                "id": f"imported_{len(captions):05d}",
                "text": text,
                "start": start,
                "end": end,
                "words": _estimate_word_timings(text, start, end),
                "source": "subtitle_import",
                "importFormat": "srt",
                "timingSource": "imported",
            })
        except Exception:
            warnings.append(f"Block '{lines[0][:40]}...' failed to parse, skipped.")
            skipped += 1

    return captions, {
        "format": "srt",
        "caption_count": len(captions),
        "skipped_blocks": skipped,
        "warnings": warnings,
        "duration_start": duration_start or 0.0,
        "duration_end": duration_end or 0.0,
        "has_estimated_word_timings": len(captions) > 0,
    }

def _parse_vtt(content: str) -> tuple[list[dict[str, Any]], ImportReport]:
    captions: list[dict[str, Any]] = []
    warnings: list[str] = []
    skipped = 0
    duration_start: float | None = None
    duration_end: float | None = None
    cue_index = 0

    blocks = re.split(r"\n\s*\n", content.strip())
    for block in blocks:
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue

        cue_index += 1

        first = lines[0]
        if first.upper().startswith("WEBVTT"):
            continue
        if _VTT_NOTE_RE.match(first):
            continue
        if first.upper() in {"STYLE", "REGION"}:
            continue

        timing_idx = None
        for i, line in enumerate(lines):
            if _VTT_TIMING_RE.search(line):
                timing_idx = i
                break

        if timing_idx is None:
            warnings.append(f"VTT cue {cue_index} has no timing line, skipped.")
            skipped += 1
            continue

        try:
            timing_line = lines[timing_idx]
            timing_line = timing_line.split("align:")[0].split("position:")[0].split("line:")[0].strip()
            match = _VTT_TIMING_RE.search(timing_line)
            if not match:
                warnings.append(f"VTT cue {cue_index} timing unparseable, skipped.")
                skipped += 1
                continue

            start = _vtt_time_to_seconds(match.group(1), match.group(2), match.group(3), match.group(4))
            end = _vtt_time_to_seconds(match.group(5), match.group(6), match.group(7), match.group(8))

            text_lines = lines[timing_idx + 1:]
            text = _strip_html(" ".join(text_lines)).strip()
            if not text:
                warnings.append(f"VTT cue {cue_index} has no text, skipped.")
                skipped += 1
                continue
            if start >= end:
                warnings.append(f"VTT cue {cue_index} has inverted timing, skipped.")
                skipped += 1
                continue

            if duration_start is None:
                duration_start = start
            duration_end = end

            captions.append({
                "id": f"imported_{len(captions):05d}",
                "text": text,
                "start": start,
                "end": end,
                "words": _estimate_word_timings(text, start, end),
                "source": "subtitle_import",
                "importFormat": "vtt",
                "timingSource": "imported",
            })
        except Exception:
            warnings.append(f"VTT cue {cue_index} failed to parse, skipped.")
            skipped += 1

    return captions, {
        "format": "vtt",
        "caption_count": len(captions),
        "skipped_blocks": skipped,
        "warnings": warnings,
        "duration_start": duration_start or 0.0,
        "duration_end": duration_end or 0.0,
        "has_estimated_word_timings": len(captions) > 0,
    }

def _ass_time_to_seconds(time_str: str) -> float:
    parts = time_str.strip().split(":")
    if len(parts) == 3:
        h = int(parts[0])
        m = int(parts[1])
        s = float(parts[2])
        return h * 3600.0 + m * 60.0 + s
    return 0.0


def _parse_ass(content: str) -> tuple[list[dict[str, Any]], ImportReport]:
    captions: list[dict[str, Any]] = []
    warnings: list[str] = []
    skipped = 0
    duration_start: float | None = None
    duration_end: float | None = None

    in_events = False
    format_columns: list[str] = []

    for raw_line in content.split("\n"):
        line = raw_line.strip()
        if not line:
            continue

        if line.lower().startswith("[events]"):
            in_events = True
            continue
        if line.lower().startswith("[") and in_events:
            in_events = False
            continue

        if not in_events:
            continue

        if _ASS_FORMAT_RE.match(line):
            parts = line.split(":", 1)
            if len(parts) == 2:
                format_columns = [col.strip() for col in parts[1].split(",")]
            continue

        if _ASS_DIALOGUE_RE.match(line):
            parts_match = _ASS_DIALOGUE_RE.match(line)
            if not parts_match or not format_columns:
                continue

            fields_str = parts_match.group(1)
            fields = [field.strip() for field in fields_str.split(",", len(format_columns) - 1)]

            if len(fields) < max(4, len(format_columns)):
                warnings.append("ASS Dialogue line has too few fields, skipped.")
                skipped += 1
                continue

            field_map = dict(zip(format_columns, fields)) if len(fields) >= len(format_columns) else {}

            try:
                start = _ass_time_to_seconds(field_map.get("Start", fields[1] if len(fields) > 1 else "0:00:00.00"))
                end = _ass_time_to_seconds(field_map.get("End", fields[2] if len(fields) > 2 else "0:00:01.00"))
            except (ValueError, IndexError):
                warnings.append("ASS Dialogue line has invalid timing, skipped.")
                skipped += 1
                continue

            raw_text = field_map.get("Text", fields[-1] if fields else "")
            text = _strip_ass_tags(raw_text)
            text = text.replace("\\N", " ").replace("\\n", " ").strip()
            if not text:
                warnings.append("ASS Dialogue line has no text after tag strip, skipped.")
                skipped += 1
                continue
            if start >= end:
                skipped += 1
                continue

            if duration_start is None:
                duration_start = start
            duration_end = end

            captions.append({
                "id": f"imported_{len(captions):05d}",
                "text": text,
                "start": start,
                "end": end,
                "words": _estimate_word_timings(text, start, end),
                "source": "subtitle_import",
                "importFormat": "ass",
                "timingSource": "imported",
            })

    captions.sort(key=lambda c: c["start"])
    return captions, {
        "format": "ass",
        "caption_count": len(captions),
        "skipped_blocks": skipped,
        "warnings": warnings,
        "duration_start": duration_start or 0.0,
        "duration_end": duration_end or 0.0,
        "has_estimated_word_timings": len(captions) > 0,
    }

def parse_subtitle_file(
    content: str,
    filename: str,
    language_mode: str = "auto_mixed_indian",
    script_mode: str = "imported",
    max_bytes: int | None = None,
) -> tuple[list[dict[str, Any]], ImportReport]:
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_IMPORT_EXTENSIONS:
        allowed = ", ".join(sorted(SUPPORTED_IMPORT_EXTENSIONS))
        raise SubtitleImportError(f"Unsupported subtitle format '{ext}'. Supported: {allowed}")

    max_size = max_bytes or int(os.environ.get("MAX_SUBTITLE_IMPORT_BYTES", str(DEFAULT_MAX_SUBTITLE_IMPORT_BYTES)))
    if len(content.encode("utf-8", errors="replace")) > max_size:
        raise SubtitleImportError(
            f"Subtitle file too large ({len(content)} chars). Maximum is {max_size} bytes."
        )

    mode = normalize_language_mode(language_mode)

    if ext == ".srt":
        captions, report = _parse_srt(content)
    elif ext == ".vtt":
        captions, report = _parse_vtt(content)
    else:
        captions, report = _parse_ass(content)

    if not captions:
        raise SubtitleImportError("No valid subtitle cues found in the file.")

    for caption in captions:
        caption["languageMode"] = mode
        caption["scriptMode"] = script_mode
        caption["lang"] = mode

    return captions, report
