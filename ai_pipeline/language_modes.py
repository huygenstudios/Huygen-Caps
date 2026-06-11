import re
import unicodedata
from typing import Any, Iterable, Literal, TypedDict

try:
    from indic_transliteration import sanscript
    from indic_transliteration.sanscript import transliterate as _indic_transliterate
except Exception:  # pragma: no cover - dependency fallback for partial installs
    sanscript = None
    _indic_transliterate = None


# ---------------------------------------------------------------------------
# Canonical language modes (v2 — June 2026)
#
# Product-facing name changes:
#   "telgish" / "teluglish"  →  "tenglish"   (UI label: Tenglish)
#   "auto_mixed_indian"      stays canonical; "auto_indian_mixed" is an alias
#
# New modes added: "telugu", "hindi", "english_translation"
#
# Backward-compat: old values "telgish" / "teluglish" still accepted by the
# normalizer and aliased to "tenglish". Old DB rows / API clients continue
# to work without a migration.
#
# Auto-mixed naming: the codebase canonical is "auto_mixed_indian".
# "auto_indian_mixed" is accepted and normalized to "auto_mixed_indian".
# The product roadmap prefers "auto_indian_mixed"; a future migration task
# can swap the canonical globally once all references are updated.
# ---------------------------------------------------------------------------

CaptionLanguageMode = Literal[
    "english",
    "telugu",
    "hindi",
    "hinglish",
    "tenglish",
    "auto_mixed_indian",
    "english_translation",
]
LanguageHint = Literal["english", "hindi", "telugu", "unknown"]

SUPPORTED_LANGUAGE_MODES: tuple[CaptionLanguageMode, ...] = (
    "english",
    "telugu",
    "hindi",
    "hinglish",
    "tenglish",
    "auto_mixed_indian",
    "english_translation",
)

# Modes that produce romanized (Latin-script) output from Indian speech.
CODE_MIXED_LANGUAGE_MODES = {"hinglish", "tenglish", "auto_mixed_indian"}

# ---------------------------------------------------------------------------
# Alias map — maps incoming string → canonical CaptionLanguageMode
# ---------------------------------------------------------------------------
_LANGUAGE_ALIASES: dict[str, CaptionLanguageMode] = {
    # ── blank / auto ────────────────────────────────────────────────────────
    "": "auto_mixed_indian",
    "auto": "auto_mixed_indian",
    "automixed": "auto_mixed_indian",
    "autoindian": "auto_mixed_indian",
    "mixed": "auto_mixed_indian",
    "mixedindian": "auto_mixed_indian",
    "auto_mixed": "auto_mixed_indian",
    "auto_mixed_indian": "auto_mixed_indian",
    # New alias per spec (auto_indian_mixed → auto_mixed_indian)
    "auto_indian_mixed": "auto_mixed_indian",
    "autoindianmixed": "auto_mixed_indian",
    # ── english ─────────────────────────────────────────────────────────────
    "en": "english",
    "eng": "english",
    "english": "english",
    # ── hindi (native Devanagari script) ────────────────────────────────────
    "hi": "hindi",
    "hin": "hindi",
    "hindi": "hindi",
    # ── hinglish (Hindi-English in Roman letters) ────────────────────────────
    "hinglish": "hinglish",
    # ── telugu (native Telugu script) ────────────────────────────────────────
    "te": "tenglish",      # short code → Tenglish (romanized) by default
    "telugu": "telugu",    # explicit native-script request
    # ── tenglish (Telugu/Telugu-English in Roman letters) ────────────────────
    "tenglish": "tenglish",
    # MIGRATION COMPAT: old product names map to tenglish
    "telgish": "tenglish",    # was the old canonical — keep for DB/API compat
    "teluglish": "tenglish",  # alternate old spelling
    "telugu_roman": "tenglish",  # spec alias: explicit romanized-Telugu request
    # ── english_translation (Indian speech → English captions) ───────────────
    "english_translation": "english_translation",
    "englishtranslation": "english_translation",
    "en_translation": "english_translation",
    "translation": "english_translation",
}

# Provider capability error messages (updated to say "Tenglish")
TELUGU_CAPABLE_PROVIDER_ERROR = (
    "Auto Mixed Indian, Tenglish, Telugu, Hindi, and English Translation modes "
    "require a configured transcription provider. "
    "Please set SARVAM_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY."
)
# Backward-compat alias (internal callers that still reference TELGISH_PROVIDER_ERROR)
TELGISH_PROVIDER_ERROR = TELUGU_CAPABLE_PROVIDER_ERROR

TELUGU_RE = re.compile(r"[\u0C00-\u0C7F]")
DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
NATIVE_INDIAN_RE = re.compile(r"[\u0900-\u097F\u0C00-\u0C7F]")
ASCII_WORD_RE = re.compile(r"[A-Za-z]")
LIGHT_PUNCT_RE = re.compile(r"[^\w\s\u0900-\u097F\u0C00-\u0C7F'-]")
SPACE_RE = re.compile(r"\s+")
TOKEN_RE = re.compile(r"\s+|[^\s]+")


class NormalizedWordToken(TypedDict, total=False):
    word: str
    originalWord: str
    languageHint: LanguageHint
    romanized: bool


# ---------------------------------------------------------------------------
# Canonicalization tables (Tenglish)
# ---------------------------------------------------------------------------
TENGLISH_CANONICAL = {
    "sait": "site",
    "saite": "site",
    "kaal": "call",
    "kal": "call",
    "klaiyant": "client",
    "klayimt": "client",
    "clientu": "client",
    "bajet": "budget",
    "badjet": "budget",
    "phonu": "phone",
    "veedio": "video",
    "aaphis": "office",
    "meeeting": "meeting",
    "mim": "meem",
    "mimu": "meemu",
    "miku": "meeku",
    "nEnu": "nenu",
    "maatlaadaanu": "maatladanu",
    "mataladanu": "maatladanu",
    "cheppaali": "cheppali",
    "cheppaanu": "cheppanu",
    "chaalaa": "chala",
    "baagundhi": "baagundi",
    "tO": "tho",
    "to": "tho",
}

# Backward-compat alias (internal code that references TELGISH_CANONICAL)
TELGISH_CANONICAL = TENGLISH_CANONICAL

HINGLISH_CANONICAL = {
    "maim": "main",
    "mai": "main",
    "kala": "kal",
    "baata": "baat",
    "bata": "baat",
    "kee": "ki",
    "kI": "ki",
    "haim": "hain",
    "nahiim": "nahi",
    "nahee": "nahi",
    "achchha": "achha",
}

COMMON_CANONICAL = {
    "veediyo": "video",
    "veedio": "video",
    "biznes": "business",
    "preemiyam": "premium",
    "reeel": "reel",
}


def normalize_language_mode(value: str | None) -> CaptionLanguageMode:
    mode = (value or "auto_mixed_indian").strip().lower().replace("-", "_").replace(" ", "_")
    compact = mode.replace("_", "")
    normalized = _LANGUAGE_ALIASES.get(mode) or _LANGUAGE_ALIASES.get(compact)
    if normalized not in SUPPORTED_LANGUAGE_MODES:
        allowed = ", ".join(SUPPORTED_LANGUAGE_MODES)
        raise ValueError(f"Unsupported language mode '{value}'. Use one of: {allowed}.")
    return normalized  # type: ignore[return-value]


def containsTeluguScript(text: str | None) -> bool:
    return bool(text and TELUGU_RE.search(text))


def containsDevanagariScript(text: str | None) -> bool:
    return bool(text and DEVANAGARI_RE.search(text))


def containsNativeIndianScript(text: str | None) -> bool:
    return bool(text and NATIVE_INDIAN_RE.search(text))


contains_telugu = containsTeluguScript


def _fallback_romanize(text: str) -> str:
    # Fallback is intentionally conservative; production installs use
    # indic-transliteration for broad Hindi/Telugu coverage.
    return text


def _simplify_itrans(text: str) -> str:
    replacements = (
        ("RRi", "ri"),
        ("RRI", "ree"),
        ("LLi", "li"),
        ("LLI", "lee"),
        ("~N", "n"),
        ("JN", "ny"),
        ("Ch", "ch"),
        ("Sh", "sh"),
        ("A", "aa"),
        ("I", "ee"),
        ("U", "oo"),
        ("M", "m"),
        ("H", "h"),
        ("N", "n"),
        ("T", "t"),
        ("D", "d"),
        ("L", "l"),
    )
    result = text
    for old, new in replacements:
        result = result.replace(old, new)
    result = unicodedata.normalize("NFKD", result)
    result = "".join(ch for ch in result if not unicodedata.combining(ch))
    return result


def _romanize_with_indic(text: str, source: str) -> str:
    if not _indic_transliterate or not sanscript:
        return _fallback_romanize(text)
    return _simplify_itrans(_indic_transliterate(text, source, sanscript.ITRANS))


def romanizeTeluguText(text: str) -> str:
    if not containsTeluguScript(text):
        return text
    source = sanscript.TELUGU if sanscript else ""
    return _romanize_with_indic(text, source)


def romanizeHindiText(text: str) -> str:
    if not containsDevanagariScript(text):
        return text
    source = sanscript.DEVANAGARI if sanscript else ""
    return _romanize_with_indic(text, source)


def _token_language_hint(token: str) -> LanguageHint:
    if containsTeluguScript(token):
        return "telugu"
    if containsDevanagariScript(token):
        return "hindi"
    if ASCII_WORD_RE.search(token):
        return "english"
    return "unknown"


def _romanize_token(token: str) -> str:
    if containsTeluguScript(token):
        return romanizeTeluguText(token)
    if containsDevanagariScript(token):
        return romanizeHindiText(token)
    return token


def romanizeMixedIndianText(text: str) -> str:
    parts = []
    for match in TOKEN_RE.finditer(text or ""):
        token = match.group(0)
        if token.isspace():
            parts.append(token)
        else:
            parts.append(_romanize_token(token))
    return "".join(parts)


def romanize_if_needed(text: str, language_mode: str) -> str:
    if language_mode in CODE_MIXED_LANGUAGE_MODES:
        return romanizeMixedIndianText(text)
    return text


def _canonicalize_word(word: str, language_mode: str) -> str:
    lookup = word.lower()
    # Tenglish (was: telgish) — apply Telugu-romanization canonical table
    if language_mode in {"tenglish", "auto_mixed_indian"}:
        lookup = TENGLISH_CANONICAL.get(lookup, lookup)
    if language_mode in {"hinglish", "auto_mixed_indian"}:
        lookup = HINGLISH_CANONICAL.get(lookup, lookup)
    lookup = COMMON_CANONICAL.get(lookup, lookup)
    return lookup


def normalizeCodeMixedText(text: str, language_mode: str) -> str:
    return normalize_caption_text(text, language_mode)


def normalize_caption_text(text: str, language_mode: str) -> str:
    if not text:
        return ""

    mode = normalize_language_mode(language_mode)
    normalized = romanize_if_needed(text, mode)
    normalized = LIGHT_PUNCT_RE.sub(" ", normalized)
    normalized = SPACE_RE.sub(" ", normalized).strip()
    if mode in CODE_MIXED_LANGUAGE_MODES:
        normalized = " ".join(_canonicalize_word(word, mode) for word in normalized.split())
        normalized = normalized.lower()
    return normalized


def normalize_word_token_with_metadata(word: str, language_mode: str) -> NormalizedWordToken:
    original = (word or "").strip()
    mode = normalize_language_mode(language_mode)
    language_hint = _token_language_hint(original)
    normalized = normalize_caption_text(original, mode)
    result: NormalizedWordToken = {
        "word": normalized,
        "languageHint": language_hint,
        "romanized": bool(original and normalized and original != normalized),
    }
    if result["romanized"]:
        result["originalWord"] = original
    return result


def normalize_word_token(word: str, language_mode: str) -> str:
    return normalize_word_token_with_metadata(word, language_mode).get("word", "").strip()


def final_text_requires_romanization(language_mode: str) -> bool:
    return normalize_language_mode(language_mode) in CODE_MIXED_LANGUAGE_MODES


def validate_roman_output(text: str, language_mode: str) -> None:
    if final_text_requires_romanization(language_mode) and containsNativeIndianScript(text):
        raise ValueError("Romanization failed; final captions still contain native Indian script.")


def text_from_words(words: Iterable[str]) -> str:
    return SPACE_RE.sub(" ", " ".join(w for w in words if w)).strip()


# ---------------------------------------------------------------------------
# Central STT language configuration
# ---------------------------------------------------------------------------

class SttLanguageConfig(TypedDict, total=False):
    provider: str
    language_code: str
    sarvam_mode: str
    script_mode: str
    display_mode: str
    description: str
    production_ready: bool
    notes: str


def get_stt_language_config(language_mode: str) -> SttLanguageConfig:
    mode = normalize_language_mode(language_mode)
    configs: dict[str, SttLanguageConfig] = {
        "english": {
            "provider": "sarvam",
            "language_code": "en-IN",
            "sarvam_mode": "transcribe",
            "script_mode": "latin",
            "display_mode": "english",
            "description": "English speech to English captions",
            "production_ready": True,
        },
        "telugu": {
            "provider": "sarvam",
            "language_code": "te-IN",
            "sarvam_mode": "transcribe",
            "script_mode": "native",
            "display_mode": "telugu_native",
            "description": "Telugu speech to Telugu native script captions",
            "production_ready": True,
        },
        "hindi": {
            "provider": "sarvam",
            "language_code": "hi-IN",
            "sarvam_mode": "transcribe",
            "script_mode": "native",
            "display_mode": "hindi_native",
            "description": "Hindi speech to Devanagari captions",
            "production_ready": True,
        },
        "hinglish": {
            "provider": "sarvam",
            "language_code": "hi-IN",
            "sarvam_mode": "translit",
            "script_mode": "roman",
            "display_mode": "hinglish_roman",
            "description": "Hindi-English speech in Roman/English letters",
            "production_ready": True,
        },
        "tenglish": {
            "provider": "sarvam",
            "language_code": "te-IN",
            "sarvam_mode": "translit",
            "script_mode": "roman",
            "display_mode": "tenglish_roman",
            "description": "Telugu/Telugu-English speech in Roman/English letters",
            "production_ready": True,
        },
        "auto_mixed_indian": {
            "provider": "sarvam",
            "language_code": "unknown",
            "sarvam_mode": "translit",
            "script_mode": "mixed",
            "display_mode": "code_mixed",
            "description": "Mixed Indian-language speech; preserves mixed words intelligently",
            "production_ready": True,
            "notes": "Current Sarvam code sends te-IN. The auto-detection path relies on Sarvam translit mode.",
        },
        "english_translation": {
            "provider": "sarvam",
            "language_code": "auto",
            "sarvam_mode": "translit",
            "script_mode": "latin",
            "display_mode": "english_translation",
            "description": "Translate supported Indic speech to English captions",
            "production_ready": False,
            "notes": "Currently routes to Sarvam translit mode; true translation pipeline is not implemented yet.",
        },
    }
    config = configs.get(mode)
    if config is None:
        raise ValueError(f"Unsupported language mode for STT config: '{mode}'")
    return config


# ---------------------------------------------------------------------------
# Lightweight transcript timing validation
# ---------------------------------------------------------------------------

class TimingValidationReport(TypedDict, total=False):
    word_count: int
    missing_timestamps: int
    invalid_timestamps: int
    non_monotonic_pairs: int
    timing_quality: str


def validate_transcript_timing(words: list[dict[str, Any]]) -> TimingValidationReport:
    word_count = len(words)
    missing = 0
    invalid = 0
    non_monotonic = 0
    previous_end: float | None = None

    for word in words:
        start = float(word.get("start", -1))
        end = float(word.get("end", -1))
        if start < 0 or end < 0:
            missing += 1
            continue
        if not (start >= 0 and end >= start):
            invalid += 1
            continue
        if previous_end is not None and start < previous_end:
            non_monotonic += 1
        previous_end = max(previous_end or 0.0, end)

    if word_count == 0:
        quality = "good"
    elif missing == word_count or invalid == word_count:
        quality = "bad"
    elif missing > 0 or invalid > 0 or non_monotonic > word_count * 0.1:
        quality = "warning"
    else:
        quality = "good"

    return {
        "word_count": word_count,
        "missing_timestamps": missing,
        "invalid_timestamps": invalid,
        "non_monotonic_pairs": non_monotonic,
        "timing_quality": quality,
    }
