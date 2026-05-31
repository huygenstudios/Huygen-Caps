import os
import logging
from typing import Any

import requests
from groq import Groq
from openai import OpenAI
from .retry import with_retry
from .config import (
    RETRY_GROQ, WHISPER_PROMPTS,
    WEAK_SEGMENT_LOGPROB, WEAK_SEGMENT_NOSPEECH, RETRANSCRIBE_WEAK
)
from .language_modes import (
    CODE_MIXED_LANGUAGE_MODES,
    TELUGU_CAPABLE_PROVIDER_ERROR,
    normalize_language_mode,
)

logger = logging.getLogger(__name__)

LANGUAGE_HINTS = {
    "english": "en",
    "en": "en",
    "hindi": "hi",
    "hi": "hi",
    "hinglish": "hi",
    "telgish": "te",
    "teluglish": "te",
    "telugu": "te",
    "auto_mixed_indian": None,
}

SARVAM_LANGUAGE_CODES = {
    "english": "en-IN",
    "hinglish": "hi-IN",
    "telgish": "te-IN",
    "auto_mixed_indian": "te-IN",
}

SARVAM_URL = "https://api.sarvam.ai/speech-to-text"


SUPPORTED_STT_PROVIDERS = {"auto", "whisper", "groq_whisper", "openai_whisper", "sarvam"}


def get_stt_provider() -> str:
    provider = os.environ.get("STT_PROVIDER", "auto").strip().lower()
    provider = provider.replace("-", "_")
    if provider in {"groq", "groq_whisper", "whisper"}:
        return "groq_whisper" if provider != "auto" else "auto"
    if provider == "openai":
        return "openai_whisper"
    if provider not in SUPPORTED_STT_PROVIDERS:
        allowed = ", ".join(sorted(SUPPORTED_STT_PROVIDERS))
        raise RuntimeError(f"STT_PROVIDER must be one of: {allowed}.")
    return provider


def _has_real_key(env_name: str) -> bool:
    value = (os.environ.get(env_name) or "").strip()
    return bool(value and not value.startswith("your_") and "placeholder" not in value.lower())


def _resolve_provider(language_mode: str, requested_provider: str | None = None) -> str:
    mode = normalize_language_mode(language_mode)
    provider = (requested_provider or get_stt_provider()).strip().lower().replace("-", "_")
    if provider == "whisper":
        provider = "groq_whisper"
    if provider == "groq":
        provider = "groq_whisper"
    if provider == "openai":
        provider = "openai_whisper"

    if provider != "auto":
        return provider

    if mode in CODE_MIXED_LANGUAGE_MODES:
        if _has_real_key("SARVAM_API_KEY"):
            return "sarvam"
        if _has_real_key("OPENAI_API_KEY"):
            return "openai_whisper"
        if _has_real_key("GROQ_API_KEY"):
            return "groq_whisper"
        raise RuntimeError(TELUGU_CAPABLE_PROVIDER_ERROR)

    if _has_real_key("GROQ_API_KEY"):
        return "groq_whisper"
    if _has_real_key("OPENAI_API_KEY"):
        return "openai_whisper"
    if _has_real_key("SARVAM_API_KEY"):
        return "sarvam"
    raise RuntimeError("Configure GROQ_API_KEY, OPENAI_API_KEY, or SARVAM_API_KEY for transcription.")


def validate_transcription_config(language_mode: str) -> None:
    language_mode = normalize_language_mode(language_mode)
    provider = _resolve_provider(language_mode)

    if provider == "sarvam":
        if not _has_real_key("SARVAM_API_KEY"):
            if language_mode in {"telgish", "auto_mixed_indian"}:
                raise RuntimeError(TELUGU_CAPABLE_PROVIDER_ERROR)
            raise RuntimeError("STT_PROVIDER=sarvam requires SARVAM_API_KEY.")
        return

    if provider == "openai_whisper":
        if not _has_real_key("OPENAI_API_KEY"):
            if language_mode in {"telgish", "auto_mixed_indian"}:
                raise RuntimeError(TELUGU_CAPABLE_PROVIDER_ERROR)
            raise RuntimeError("STT_PROVIDER=openai_whisper requires OPENAI_API_KEY.")
        return

    if not _has_real_key("GROQ_API_KEY"):
        if language_mode in {"telgish", "auto_mixed_indian"}:
            raise RuntimeError(TELUGU_CAPABLE_PROVIDER_ERROR)
        raise RuntimeError("STT_PROVIDER=groq_whisper requires GROQ_API_KEY.")


def _call_groq(client, audio_path: str, prompt: str, language_hint: str | None,
               temperature: float = 0.0) -> dict:
    """Single Groq Whisper call returning normalized dict."""
    with open(audio_path, "rb") as file:
        kwargs = {
            "file": (audio_path, file.read()),
            "model": "whisper-large-v3",
            "response_format": "verbose_json",
            "timestamp_granularities": ["word", "segment"],
            "temperature": temperature,
        }
        if prompt:
            kwargs["prompt"] = prompt
        if language_hint:
            kwargs["language"] = language_hint

        transcription = client.audio.transcriptions.create(**kwargs)

    if hasattr(transcription, "model_dump"):
        payload = transcription.model_dump()
    elif isinstance(transcription, dict):
        payload = transcription
    else:
        payload = {"text": str(transcription).strip()}

    return {
        "text": (payload.get("text") or "").strip(),
        "language": payload.get("language"),
        "duration": payload.get("duration"),
        "segments": payload.get("segments") or [],
        "words": payload.get("words") or [],
        "provider": "groq_whisper",
    }


def _call_openai_whisper(audio_path: str, language_mode: str) -> dict:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("STT_PROVIDER=openai_whisper requires OPENAI_API_KEY.")

    client = OpenAI(api_key=api_key)
    language_hint = LANGUAGE_HINTS.get(language_mode)
    prompt = WHISPER_PROMPTS.get(language_mode, "")

    with open(audio_path, "rb") as file:
        kwargs: dict[str, Any] = {
            "file": file,
            "model": "whisper-1",
            "response_format": "verbose_json",
            "timestamp_granularities": ["word", "segment"],
        }
        if language_hint:
            kwargs["language"] = language_hint
        if prompt:
            kwargs["prompt"] = prompt
        transcription = client.audio.transcriptions.create(**kwargs)

    if hasattr(transcription, "model_dump"):
        payload = transcription.model_dump()
    elif isinstance(transcription, dict):
        payload = transcription
    else:
        payload = {"text": str(transcription).strip()}

    return {
        "text": (payload.get("text") or "").strip(),
        "language": payload.get("language"),
        "duration": payload.get("duration"),
        "segments": payload.get("segments") or [],
        "words": payload.get("words") or [],
        "provider": "openai_whisper",
    }


def _normalize_sarvam_words(payload: dict[str, Any]) -> list[dict[str, Any]]:
    timestamps = payload.get("timestamps") or {}
    words = timestamps.get("words") or []
    starts = timestamps.get("start_time_seconds") or []
    ends = timestamps.get("end_time_seconds") or []
    normalized: list[dict[str, Any]] = []

    for i, word in enumerate(words):
        try:
            start = float(starts[i])
            end = float(ends[i])
        except (IndexError, TypeError, ValueError):
            continue
        if end <= start:
            continue
        normalized.append(
            {
                "word": str(word).strip(),
                "start": start,
                "end": end,
                "score": float(payload.get("language_probability") or 0.0),
                "provider": "sarvam",
                "timing_source": "provider_word",
            }
        )

    return normalized


def _call_sarvam(audio_path: str, language_mode: str) -> dict:
    api_key = os.environ.get("SARVAM_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("STT_PROVIDER=sarvam requires SARVAM_API_KEY.")

    language_code = SARVAM_LANGUAGE_CODES[language_mode]
    mode = "translit" if language_mode in CODE_MIXED_LANGUAGE_MODES else "transcribe"

    with open(audio_path, "rb") as file:
        response = requests.post(
            SARVAM_URL,
            headers={"api-subscription-key": api_key},
            data={
                "model": "saaras:v3",
                "mode": mode,
                "language_code": language_code,
                "with_timestamps": "true",
            },
            files={"file": (os.path.basename(audio_path), file, "audio/wav")},
            timeout=120,
        )

    if response.status_code >= 400:
        detail = response.text[:500]
        raise RuntimeError(f"Sarvam transcription failed ({response.status_code}): {detail}")

    payload = response.json()
    return {
        "text": (payload.get("transcript") or "").strip(),
        "language": payload.get("language_code"),
        "duration": None,
        "segments": [],
        "words": _normalize_sarvam_words(payload),
        "provider": "sarvam",
        "request_id": payload.get("request_id"),
        "language_probability": payload.get("language_probability"),
    }


def _has_weak_segments(result: dict) -> bool:
    """Check if any segment has low confidence or high no-speech probability."""
    for seg in result.get("segments", []):
        logprob = seg.get("avg_logprob", 0.0)
        nospeech = seg.get("no_speech_prob", 0.0)
        if logprob is not None and logprob < WEAK_SEGMENT_LOGPROB:
            return True
        if nospeech is not None and nospeech > WEAK_SEGMENT_NOSPEECH:
            return True
    return False


def _merge_word_lists(primary: list, secondary: list) -> list:
    """Combine word lists, taking the longer/richer version."""
    if not primary:
        return secondary
    if not secondary:
        return primary
    # Pick whichever returned more words — more words = more recall
    return primary if len(primary) >= len(secondary) else secondary


@with_retry(max_retries=RETRY_GROQ)
def transcribe_chunk_with_retry(audio_path: str, language: str = "") -> dict:
    """Groq Whisper with double-pass on weak segments for maximum recall."""
    api_key = os.environ.get("GROQ_API_KEY", "dummy")
    client = Groq(api_key=api_key)

    prompt = WHISPER_PROMPTS.get(language, "")
    language_hint = LANGUAGE_HINTS.get(language)

    # Pass 1: deterministic decode (temperature=0)
    result = _call_groq(client, audio_path, prompt, language_hint, temperature=0.0)

    # Pass 2: if weak segments detected, re-transcribe with slight temperature
    # to catch words the deterministic pass missed
    if RETRANSCRIBE_WEAK and _has_weak_segments(result):
        logger.info(f"Weak segments detected in {audio_path}, running rescue pass...")
        try:
            rescue = _call_groq(client, audio_path, prompt, language_hint, temperature=0.2)
            # Take whichever has more text (more recall)
            if len(rescue["text"].split()) > len(result["text"].split()):
                logger.info(f"Rescue pass recovered more words: {len(rescue['text'].split())} vs {len(result['text'].split())}")
                result["text"] = rescue["text"]
                result["segments"] = rescue["segments"]
            # Always merge word lists for max coverage
            result["words"] = _merge_word_lists(result["words"], rescue["words"])
        except Exception as e:
            logger.warning(f"Rescue pass failed: {e}. Using first pass only.")

    return result


def transcribe_audio(audio_path: str, language_mode: str = "english") -> dict:
    """Provider abstraction for speech-to-text used by the pipeline."""
    normalized_mode = normalize_language_mode(language_mode)
    validate_transcription_config(normalized_mode)

    provider = _resolve_provider(normalized_mode)
    if provider == "sarvam":
        return _call_sarvam(audio_path, normalized_mode)
    if provider == "openai_whisper":
        return _call_openai_whisper(audio_path, normalized_mode)

    return transcribe_chunk_with_retry(audio_path, language=normalized_mode)
