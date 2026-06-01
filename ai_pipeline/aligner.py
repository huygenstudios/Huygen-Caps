import logging

try:
    from .retry import with_retry
    from .config import RETRY_ALIGN
except ImportError:
    # Handle circular imports or relative imports nicely
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from retry import with_retry
    from config import RETRY_ALIGN

logger = logging.getLogger(__name__)


def _rescue_missing_words(input_segments: list, aligned_segments: list) -> list:
    """
    Compares input text against aligned output. Any word present in input but
    absent in aligned output gets rescued with interpolated timestamps so that
    the renderer never silently drops it.
    """
    # Collect all aligned words
    aligned_words_set = set()
    for seg in aligned_segments:
        for w in seg.get("words", []):
            aligned_words_set.add(w.get("word", "").strip().lower())

    for seg_idx, seg in enumerate(aligned_segments):
        # Find the source text for this segment
        source_text = ""
        if seg_idx < len(input_segments):
            src = input_segments[seg_idx]
            source_text = src["text"] if isinstance(src, dict) else str(src)

        source_words = source_text.split()
        aligned_words = seg.get("words", [])

        if not source_words or not aligned_words:
            # If alignment returned zero words but source has text,
            # create evenly-spaced word entries from segment bounds
            if source_words and "start" in seg and "end" in seg:
                n = len(source_words)
                dur = (seg["end"] - seg["start"]) / max(n, 1)
                seg["words"] = []
                for i, sw in enumerate(source_words):
                    seg["words"].append({
                        "word": sw,
                        "start": round(seg["start"] + i * dur, 3),
                        "end": round(seg["start"] + (i + 1) * dur, 3),
                        "score": 0.5,
                        "timing_source": "low_confidence_interpolated",
                    })
            continue

        # Build a set of aligned word texts (lowered) with their indices
        aligned_texts = [w.get("word", "").strip().lower() for w in aligned_words]

        # Check each source word against aligned output
        missing = []
        for sw in source_words:
            if sw.strip().lower() not in aligned_texts:
                missing.append(sw)

        if not missing:
            continue

        # Interpolate timestamps for missing words by inserting them
        # at the end of the segment with small durations
        logger.info(f"Segment {seg_idx}: rescuing {len(missing)} unaligned words: {missing}")
        last_end = aligned_words[-1].get("end", seg.get("end", 0))
        gap = 0.08  # 80ms per rescued word
        for mw in missing:
            seg["words"].append({
                "word": mw,
                "start": round(last_end, 3),
                "end": round(last_end + gap, 3),
                "score": 0.3,  # low confidence marker
                "timing_source": "low_confidence_interpolated",
            })
            last_end += gap + 0.02

        # Re-sort words by start time
        seg["words"].sort(key=lambda w: w.get("start", 0))

    return aligned_segments


def _fallback_align_segments(tokens: list) -> list:
    """Create deterministic word timestamps when optional WhisperX alignment is unavailable."""
    if not tokens:
        return []

    segments = []
    if isinstance(tokens[0], dict):
        prompt_segments = [
            {
                "text": str(token.get("text", "")).strip(),
                "start": float(token.get("start", 0.0) or 0.0),
                "end": float(token.get("end", token.get("start", 0.0)) or 0.0),
            }
            for token in tokens
        ]
    else:
        prompt_segments = []
        cursor = 0.0
        for token in tokens:
            text = str(token).strip()
            duration = max(0.35, len(text.split()) * 0.22)
            prompt_segments.append({"text": text, "start": cursor, "end": cursor + duration})
            cursor += duration

    for segment in prompt_segments:
        text = segment["text"]
        words = text.split()
        start = float(segment["start"])
        end = max(start + 0.08, float(segment["end"]))
        duration = max(0.08, end - start)
        word_duration = duration / max(1, len(words))
        segments.append(
            {
                "text": text,
                "start": round(start, 3),
                "end": round(end, 3),
                "words": [
                    {
                        "word": word,
                        "start": round(start + index * word_duration, 3),
                        "end": round(start + (index + 1) * word_duration, 3),
                        "score": 0.45,
                        "timing_source": "interpolated_no_whisperx",
                    }
                    for index, word in enumerate(words)
                ],
            }
        )

    return segments


@with_retry(max_retries=RETRY_ALIGN)
def align_text(tokens: list, audio_path: str, model_id: str):
    """
    Uses WhisperX for forced word-level alignment.
    Falls back gracefully if alignment fails.
    Rescues any words that WhisperX failed to align.
    """
    try:
        import librosa
        import torch
        import whisperx

        try:
            from .alignment_models import get_alignment_model
        except ImportError:
            from alignment_models import get_alignment_model

        device = "cuda" if torch.cuda.is_available() else "cpu"

        # Get model directly
        model, metadata = get_alignment_model(model_id, device)
        
        # Get audio duration for distributing segment timestamps
        duration = librosa.get_duration(filename=audio_path)
        
        # Format tokens as whisperX expects - each segment needs start, end, text
        n = len(tokens)
        if n == 0:
            return []
        
        prompt_segments = []
        if isinstance(tokens[0], dict):
            # Pre-computed bounds derived directly from audio chunk times!
            for t in tokens:
                prompt_segments.append({
                    "text": t["text"],
                    "start": round(t["start"], 3),
                    "end": round(t["end"], 3)
                })
        else:
            seg_duration = duration / n
            for i, t in enumerate(tokens):
                prompt_segments.append({
                    "text": t,
                    "start": round(i * seg_duration, 3),
                    "end": round(min((i + 1) * seg_duration, duration), 3),
                })
        
        # Load audio for whisperx
        audio = whisperx.load_audio(audio_path)
        
        result = whisperx.align(
            prompt_segments, 
            model, 
            metadata, 
            audio, 
            device
        )
        aligned = result["segments"]

        # Rescue any words that WhisperX could not align
        aligned = _rescue_missing_words(prompt_segments, aligned)

        return aligned
    except Exception as e:
        logger.warning(
            "WhisperX alignment unavailable or failed for %s with %s: %s. "
            "Using deterministic interpolated word timestamps.",
            audio_path,
            model_id,
            e,
        )
        return _fallback_align_segments(tokens)
