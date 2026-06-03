import logging
import os
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
MIN_SPEECH_RETIME_WORDS = 6
MIN_SPEECH_RETIME_TRAILING_GAP = 1.0
MIN_SPEECH_RETIME_COMPRESSION_RATIO = 0.78


class TranscriptValidationError(ValueError):
    pass


def _as_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _env_bool(name: str, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    if value in {"1", "true", "yes", "on", "enabled"}:
        return True
    if value in {"0", "false", "no", "off", "disabled"}:
        return False
    return default


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


def _expand_compound_raw_word(raw_word: dict[str, Any]) -> list[dict[str, Any]]:
    raw_text = str(raw_word.get("word") or raw_word.get("text") or "").strip()
    tokens = [token for token in raw_text.split() if token]
    start = _as_float(raw_word.get("start"))
    end = _as_float(raw_word.get("end"))

    if len(tokens) <= 1 or start is None or end is None or end <= start:
        return [raw_word]

    duration = end - start
    source = str(raw_word.get("timing_source") or "provider_word")
    timing_source = source if "interpolated" in source else f"{source}_interpolated"
    expanded: list[dict[str, Any]] = []

    for index, token in enumerate(tokens):
        token_start = start + (duration * index / len(tokens))
        token_end = end if index == len(tokens) - 1 else start + (duration * (index + 1) / len(tokens))
        expanded.append(
            {
                **raw_word,
                "word": token,
                "start": round(token_start, 3),
                "end": round(max(token_start + MIN_WORD_DURATION, token_end), 3),
                "timing_source": timing_source,
            }
        )

    return expanded


def _mark_timing_repaired(word: dict[str, Any], reason: str) -> None:
    source = str(word.get("timing_source") or "provider_word")
    if "repaired" not in source:
        source = f"{source}_repaired"
    word["timing_source"] = source
    word["timing_repair"] = reason


def _clip_speech_segments_to_chunk(
    speech_segments: list[dict[str, Any]] | None,
    chunk_start: float,
    chunk_end: float,
) -> list[tuple[float, float]]:
    intervals: list[tuple[float, float]] = []
    for segment in speech_segments or []:
        start = _as_float(segment.get("start"))
        end = _as_float(segment.get("end"))
        if start is None or end is None:
            continue
        clipped_start = max(chunk_start, start)
        clipped_end = min(chunk_end, end)
        if clipped_end - clipped_start >= MIN_WORD_DURATION:
            intervals.append((round(clipped_start, 3), round(clipped_end, 3)))

    intervals.sort(key=lambda item: item[0])
    merged: list[tuple[float, float]] = []
    for start, end in intervals:
        if merged and start - merged[-1][1] <= 0.08:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def _project_speech_offset_to_time(offset: float, intervals: list[tuple[float, float]]) -> float:
    if not intervals:
        return max(0.0, offset)

    remaining = max(0.0, offset)
    for start, end in intervals:
        duration = max(0.0, end - start)
        if remaining <= duration:
            return start + remaining
        remaining -= duration
    return intervals[-1][1]


def _retime_compressed_words_to_speech(
    words: list[dict[str, Any]],
    chunk_start: float,
    chunk_end: float,
    speech_segments: list[dict[str, Any]] | None,
) -> int:
    if not _env_bool("ENABLE_SPEECH_SPAN_RETIMER", True):
        return 0
    if len(words) < MIN_SPEECH_RETIME_WORDS:
        return 0

    intervals = _clip_speech_segments_to_chunk(speech_segments, chunk_start, chunk_end)
    if not intervals:
        return 0

    first_start = _as_float(words[0].get("start"))
    last_end = _as_float(words[-1].get("end"))
    if first_start is None or last_end is None or last_end <= first_start:
        return 0

    target_start = min(first_start, intervals[0][0])
    if target_start < intervals[0][0] - 0.2:
        intervals = [(target_start, intervals[0][0]), *intervals]
    target_end = intervals[-1][1]
    source_span = max(MIN_WORD_DURATION, last_end - first_start)
    target_speech_duration = sum(max(0.0, end - start) for start, end in intervals)
    target_span = max(MIN_WORD_DURATION, target_end - target_start)
    trailing_gap = target_end - last_end

    if trailing_gap < MIN_SPEECH_RETIME_TRAILING_GAP:
        return 0
    if source_span >= target_speech_duration * MIN_SPEECH_RETIME_COMPRESSION_RATIO:
        return 0
    if target_span <= source_span + MIN_SPEECH_RETIME_TRAILING_GAP:
        return 0

    repaired = 0
    previous_end = target_start
    for word in words:
        original_start = _as_float(word.get("start"))
        original_end = _as_float(word.get("end"))
        if original_start is None or original_end is None or original_end <= original_start:
            continue

        start_offset = ((original_start - first_start) / source_span) * target_speech_duration
        end_offset = ((original_end - first_start) / source_span) * target_speech_duration
        new_start = max(previous_end, _project_speech_offset_to_time(start_offset, intervals))
        new_end = max(new_start + MIN_WORD_DURATION, _project_speech_offset_to_time(end_offset, intervals))
        new_end = min(target_end, new_end)
        if new_end <= new_start:
            new_end = min(target_end, new_start + MIN_WORD_DURATION)

        word["start"] = round(max(0.0, new_start), 3)
        word["end"] = round(max(word["start"] + MIN_WORD_DURATION, new_end), 3)
        _mark_timing_repaired(
            word,
            f"speech span retimed from {original_start:.3f}-{original_end:.3f}",
        )
        previous_end = word["end"]
        repaired += 1

    if repaired:
        logger.info(
            "retimed compressed provider word span to speech intervals",
            extra={
                "word_count": repaired,
                "chunk_start": round(chunk_start, 3),
                "chunk_end": round(chunk_end, 3),
                "source_span": round(source_span, 3),
                "target_speech_duration": round(target_speech_duration, 3),
                "target_end": round(target_end, 3),
            },
        )
    return repaired


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
            for expanded_raw_word in _expand_compound_raw_word(raw_word):
                normalized = _normalize_word(expanded_raw_word, language_mode)
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
    speech_segments: list[dict[str, Any]] | None = None,
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

            absolute_word = {
                **raw,
                "start": round(chunk.start_time + start, 3),
                "end": round(chunk.start_time + end, 3),
                "provider": provider,
                "timing_source": raw.get("timing_source") or "provider_word",
            }
            absolute_words.extend(_expand_compound_raw_word(absolute_word))

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
            # Drop only words that are clearly duplicates of an already-emitted
            # word inside the chunk overlap region.  A word is considered a
            # duplicate when:
            #   1. it ends BEFORE the last emitted word (no +slack tolerance —
            #      the previous 0.02s slop was dropping legitimate last words
            #      that just happened to end within 20ms of a previous one),
            #   2. AND its text matches a recent emitted word.
            # Anything else is kept, even if the gap is tiny.
            if end < emitted_until and text in recent_words[-12:]:
                continue
            deduped_words.append(word)
            emitted_until = max(emitted_until, end)
            recent_words.append(text)

        normalized_words = deduped_words
        if not normalized_words:
            continue

        _retime_compressed_words_to_speech(
            normalized_words,
            float(chunk.start_time),
            float(chunk.end_time),
            speech_segments,
        )

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
