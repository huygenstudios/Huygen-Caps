import logging
from typing import Any

from .audio import Chunk
from .language_modes import (
    final_text_requires_romanization,
    normalize_caption_text,
    normalize_language_mode,
    normalize_word_token_with_metadata,
    text_from_words,
    validate_roman_output,
)

logger = logging.getLogger(__name__)

MIN_WORD_DURATION = 0.04


class TranscriptValidationError(ValueError):
    pass


def _as_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_word(raw_word: dict[str, Any], language_mode: str) -> dict[str, Any] | None:
    word_meta = normalize_word_token_with_metadata(
        str(raw_word.get("word") or raw_word.get("text") or ""),
        language_mode,
    )
    word = word_meta.get("word", "")
    start = _as_float(raw_word.get("start"))
    end = _as_float(raw_word.get("end"))
    if not word or start is None or end is None:
        return None

    normalized = {
        "word": word,
        "start": round(start, 3),
        "end": round(end, 3),
        "score": _as_float(raw_word.get("score")) if raw_word.get("score") is not None else 0.0,
    }
    if word_meta.get("originalWord"):
        normalized["originalWord"] = word_meta["originalWord"]
    if word_meta.get("languageHint"):
        normalized["languageHint"] = word_meta["languageHint"]
    if raw_word.get("confidence") is not None:
        normalized["confidence"] = _as_float(raw_word.get("confidence"))
    if raw_word.get("timing_source"):
        normalized["timing_source"] = raw_word["timing_source"]
    if raw_word.get("provider"):
        normalized["provider"] = raw_word["provider"]
    if end <= start:
        normalized["end"] = round(start + MIN_WORD_DURATION, 3)
        _mark_timing_repaired(
            normalized,
            f"duration expanded from {start:.3f}-{end:.3f}",
        )
    return normalized


def _mark_timing_repaired(word: dict[str, Any], reason: str) -> None:
    source = str(word.get("timing_source") or "provider_word")
    if "repaired" not in source:
        source = f"{source}_repaired"
    word["timing_source"] = source
    word["timing_repair"] = reason


def repair_word_timestamps(segments: list[dict[str, Any]]) -> int:
    """
    Keep word order intact while repairing provider/alignment overlaps.

    Real STT and forced-alignment providers occasionally return adjacent words
    with duplicated or slightly backwards boundaries. The caption renderer needs
    monotonic intervals, so repair those boundaries before validation instead of
    failing the whole generation job.
    """
    previous_end: float | None = None
    repaired_count = 0

    for seg in segments:
        words = seg.get("words") or []
        if not words:
            continue

        for word in words:
            start = _as_float(word.get("start"))
            end = _as_float(word.get("end"))
            if start is None or end is None:
                continue

            original_start = start
            original_end = end
            if previous_end is not None and start < previous_end:
                start = previous_end
                end = max(end, start + MIN_WORD_DURATION)
                repaired_count += 1
                _mark_timing_repaired(
                    word,
                    f"overlap adjusted from {original_start:.3f}-{original_end:.3f}",
                )
            elif end <= start:
                end = start + MIN_WORD_DURATION
                repaired_count += 1
                _mark_timing_repaired(
                    word,
                    f"duration expanded from {original_start:.3f}-{original_end:.3f}",
                )

            word["start"] = round(max(0.0, start), 3)
            word["end"] = round(max(word["start"] + MIN_WORD_DURATION, end), 3)
            previous_end = word["end"]

        valid_words = [
            word
            for word in words
            if _as_float(word.get("start")) is not None and _as_float(word.get("end")) is not None
        ]
        if valid_words:
            seg["start"] = valid_words[0]["start"]
            seg["end"] = valid_words[-1]["end"]

    if repaired_count:
        logger.warning("repaired non-monotonic word timings", extra={"repaired_word_count": repaired_count})
    return repaired_count


def normalize_aligned_segments(segments: list[dict[str, Any]], language_mode: str) -> list[dict[str, Any]]:
    normalized_segments: list[dict[str, Any]] = []
    mode = normalize_language_mode(language_mode)

    for seg in segments:
        words = []
        for raw_word in seg.get("words") or []:
            normalized = _normalize_word(raw_word, language_mode)
            if normalized:
                words.append(normalized)

        text = normalize_caption_text(seg.get("text") or text_from_words(w["word"] for w in words), mode)
        try:
            validate_roman_output(text, mode)
        except ValueError as exc:
            raise TranscriptValidationError(str(exc)) from exc
        start = _as_float(seg.get("start"))
        end = _as_float(seg.get("end"))

        if words:
            start = words[0]["start"] if start is None else min(start, words[0]["start"])
            end = words[-1]["end"] if end is None else max(end, words[-1]["end"])
            if not text:
                text = text_from_words(w["word"] for w in words)

        if start is None or end is None or end <= start or not text:
            continue

        normalized_segments.append(
            {
                "id": str(seg.get("id") or f"seg_{len(normalized_segments) + 1:04d}"),
                "start": round(start, 3),
                "end": round(end, 3),
                "text": text,
                "words": words,
            }
        )

    repair_word_timestamps(normalized_segments)
    validate_word_timestamps(normalized_segments)
    return normalized_segments


def validate_word_timestamps(segments: list[dict[str, Any]]) -> None:
    previous_end = -0.001
    visible_word_count = 0

    for seg_index, seg in enumerate(segments):
        words = seg.get("words") or []
        if not words:
            raise TranscriptValidationError(
                f"Segment {seg_index + 1} has no word-level timestamps."
            )

        for word_index, word in enumerate(words):
            visible_word_count += 1
            start = _as_float(word.get("start"))
            end = _as_float(word.get("end"))
            text = (word.get("word") or "").strip()
            if not text:
                raise TranscriptValidationError(
                    f"Segment {seg_index + 1}, word {word_index + 1} is empty."
                )
            if start is None or end is None or end <= start:
                raise TranscriptValidationError(
                    f"Word '{text}' has broken timing ({start}, {end})."
                )
            if start < previous_end:
                raise TranscriptValidationError(
                    f"Word timings are not increasing near '{text}'."
                )
            previous_end = max(previous_end, end)

    if visible_word_count == 0:
        raise TranscriptValidationError("Transcript has no visible timed words.")


def build_word_timed_transcript_from_chunks(
    chunks: list[Chunk],
    language_mode: str,
) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    mode = normalize_language_mode(language_mode)
    emitted_until = -0.001
    recent_words: list[str] = []

    for chunk in sorted(chunks, key=lambda c: c.index):
        metadata = getattr(chunk, "asr_metadata", None) or {}
        raw_words = metadata.get("words") or []
        provider = metadata.get("provider") or "unknown"
        if not raw_words:
            raise TranscriptValidationError(
                "Transcription provider did not return word-level timestamps. "
                "Configure SARVAM_API_KEY with STT_PROVIDER=sarvam or use a "
                "Whisper provider that returns word timestamps."
            )

        absolute_words: list[dict[str, Any]] = []
        for raw in raw_words:
            start = _as_float(raw.get("start"))
            end = _as_float(raw.get("end"))
            if start is None or end is None:
                continue

            absolute_words.append(
                {
                    **raw,
                    "start": round(chunk.start_time + start, 3),
                    "end": round(chunk.start_time + end, 3),
                    "provider": provider,
                    "timing_source": raw.get("timing_source") or "provider_word",
                }
            )

        normalized_words = [
            w for w in (_normalize_word(w, mode) for w in absolute_words) if w
        ]
        if not normalized_words:
            raise TranscriptValidationError(
                f"Chunk {chunk.index + 1} has no usable word timestamps after normalization."
            )

        deduped_words: list[dict[str, Any]] = []
        for word in normalized_words:
            text = str(word.get("word") or "").lower()
            start = _as_float(word.get("start")) or 0.0
            end = _as_float(word.get("end")) or 0.0
            if end <= emitted_until + 0.02:
                continue
            if start < emitted_until - 0.1 and text in recent_words[-12:]:
                continue
            deduped_words.append(word)
            emitted_until = max(emitted_until, end)
            recent_words.append(text)

        normalized_words = deduped_words
        if not normalized_words:
            continue

        segment_text = normalize_caption_text(
            chunk.final_text or text_from_words(w["word"] for w in normalized_words),
            mode,
        )
        if not segment_text:
            segment_text = text_from_words(w["word"] for w in normalized_words)
        try:
            validate_roman_output(segment_text, mode)
        except ValueError as exc:
            raise TranscriptValidationError(str(exc)) from exc

        segments.append(
            {
                "id": f"seg_{len(segments) + 1:04d}",
                "start": normalized_words[0]["start"],
                "end": normalized_words[-1]["end"],
                "text": segment_text,
                "words": normalized_words,
            }
        )

    repair_word_timestamps(segments)
    validate_word_timestamps(segments)
    logger.info("word timestamps normalized", extra={"segment_count": len(segments)})
    return segments


def build_normalized_transcript(
    segments: list[dict[str, Any]],
    language_mode: str,
    provider: str,
) -> dict[str, Any]:
    mode = normalize_language_mode(language_mode)
    romanized = final_text_requires_romanization(mode) and any(
        word.get("originalWord")
        for segment in segments
        for word in segment.get("words", [])
    )
    return {
        "languageMode": mode,
        "provider": provider,
        "romanized": romanized,
        "segments": segments,
    }
