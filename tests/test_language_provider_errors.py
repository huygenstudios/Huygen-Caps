from ai_pipeline.language_modes import (
    get_stt_language_config,
    normalize_language_mode,
    validate_transcript_timing,
)
from ai_pipeline.transcriber import OPENAI_KEY_ERROR, _looks_like_auth_error, _resolve_provider, transcribe_audio
import os
import pytest


def test_telugu_aliases_normalize_to_tenglish():
    assert normalize_language_mode("tenglish") == "tenglish"
    assert normalize_language_mode("telgish") == "tenglish"
    assert normalize_language_mode("teluglish") == "tenglish"
    assert normalize_language_mode("telugu_roman") == "tenglish"

def test_telugu_native_script_stays_telugu():
    assert normalize_language_mode("telugu") == "telugu"

def test_other_modes_passthrough():
    assert normalize_language_mode("english") == "english"
    assert normalize_language_mode("hindi") == "hindi"
    assert normalize_language_mode("hinglish") == "hinglish"
    assert normalize_language_mode("auto_mixed_indian") == "auto_mixed_indian"
    assert normalize_language_mode("auto_indian_mixed") == "auto_mixed_indian"
    assert normalize_language_mode("english_translation") == "english_translation"

def test_blank_normalizes_to_auto_mixed_indian():
    assert normalize_language_mode("") == "auto_mixed_indian"
    assert normalize_language_mode(None) == "auto_mixed_indian"


def test_openai_auth_error_detection_for_raw_provider_message():
    raw = "Error code: 401 - {'error': {'message': 'Invalid API Key', 'code': 'invalid_api_key'}}"
    assert _looks_like_auth_error(RuntimeError(raw))
    assert "OPENAI_API_KEY" in OPENAI_KEY_ERROR


def test_deepgram_not_auto_selected_even_with_api_key_set():
    saved = os.environ.get("DEEPGRAM_API_KEY")
    saved_sarvam = os.environ.get("SARVAM_API_KEY")
    saved_groq = os.environ.get("GROQ_API_KEY")
    saved_openai = os.environ.get("OPENAI_API_KEY")
    try:
        os.environ.pop("SARVAM_API_KEY", None)
        os.environ.pop("GROQ_API_KEY", None)
        os.environ.pop("OPENAI_API_KEY", None)
        os.environ["DEEPGRAM_API_KEY"] = "fake-key-123"
        with pytest.raises(RuntimeError, match="Deepgram is not yet implemented"):
            _resolve_provider("english")
        with pytest.raises(RuntimeError, match="require a configured transcription provider"):
            _resolve_provider("hinglish")
    finally:
        _restore_env(saved, "DEEPGRAM_API_KEY")
        _restore_env(saved_sarvam, "SARVAM_API_KEY")
        _restore_env(saved_groq, "GROQ_API_KEY")
        _restore_env(saved_openai, "OPENAI_API_KEY")


def test_deepgram_explicit_selection_gives_not_implemented_error():
    saved = os.environ.get("STT_PROVIDER")
    try:
        os.environ["STT_PROVIDER"] = "deepgram"
        with pytest.raises(NotImplementedError, match="Deepgram STT is configured but not implemented yet"):
            transcribe_audio("nonexistent.wav", "english")
    finally:
        _restore_env(saved, "STT_PROVIDER")


def _restore_env(value, name):
    if value is None:
        os.environ.pop(name, None)
    else:
        os.environ[name] = value


def test_stt_config_english():
    config = get_stt_language_config("english")
    assert config["provider"] == "sarvam"
    assert config["language_code"] == "en-IN"
    assert config["sarvam_mode"] == "transcribe"
    assert config["script_mode"] == "latin"
    assert config["display_mode"] == "english"
    assert config["production_ready"] is True


def test_stt_config_telugu():
    config = get_stt_language_config("telugu")
    assert config["provider"] == "sarvam"
    assert config["language_code"] == "te-IN"
    assert config["sarvam_mode"] == "transcribe"
    assert config["script_mode"] == "native"
    assert config["display_mode"] == "telugu_native"


def test_stt_config_hindi():
    config = get_stt_language_config("hindi")
    assert config["provider"] == "sarvam"
    assert config["language_code"] == "hi-IN"
    assert config["sarvam_mode"] == "transcribe"
    assert config["script_mode"] == "native"
    assert config["display_mode"] == "hindi_native"


def test_stt_config_hinglish():
    config = get_stt_language_config("hinglish")
    assert config["provider"] == "sarvam"
    assert config["language_code"] == "hi-IN"
    assert config["sarvam_mode"] == "translit"
    assert config["script_mode"] == "roman"
    assert config["display_mode"] == "hinglish_roman"


def test_stt_config_tenglish():
    config = get_stt_language_config("tenglish")
    assert config["provider"] == "sarvam"
    assert config["language_code"] == "te-IN"
    assert config["sarvam_mode"] == "translit"
    assert config["script_mode"] == "roman"
    assert config["display_mode"] == "tenglish_roman"


def test_stt_config_auto_mixed_indian():
    config = get_stt_language_config("auto_mixed_indian")
    assert config["provider"] == "sarvam"
    assert config["sarvam_mode"] == "translit"
    assert config["script_mode"] == "mixed"
    assert config["display_mode"] == "code_mixed"
    assert config["production_ready"] is True


def test_stt_config_english_translation():
    config = get_stt_language_config("english_translation")
    assert config["provider"] == "sarvam"
    assert config["script_mode"] == "latin"
    assert config["display_mode"] == "english_translation"
    assert config["production_ready"] is False


def test_legacy_telgish_maps_to_tenglish_config():
    config = get_stt_language_config("telgish")
    assert config["provider"] == "sarvam"
    assert config["language_code"] == "te-IN"
    assert config["sarvam_mode"] == "translit"
    assert config["display_mode"] == "tenglish_roman"


def test_legacy_teluglish_maps_to_tenglish_config():
    config = get_stt_language_config("teluglish")
    assert config["display_mode"] == "tenglish_roman"


def test_auto_indian_mixed_maps_to_auto_mixed_config():
    config = get_stt_language_config("auto_indian_mixed")
    assert config["display_mode"] == "code_mixed"


def test_timing_validation_good_case():
    words = [
        {"start": 0.0, "end": 0.5, "word": "hello"},
        {"start": 0.5, "end": 1.0, "word": "world"},
        {"start": 1.0, "end": 1.5, "word": "test"},
    ]
    report = validate_transcript_timing(words)
    assert report["word_count"] == 3
    assert report["missing_timestamps"] == 0
    assert report["invalid_timestamps"] == 0
    assert report["non_monotonic_pairs"] == 0
    assert report["timing_quality"] == "good"


def test_timing_validation_missing_timestamps():
    words = [
        {"start": 0.0, "end": 0.5, "word": "hello"},
        {"word": "missing"},
        {"start": -1, "end": -1, "word": "bad"},
    ]
    report = validate_transcript_timing(words)
    assert report["word_count"] == 3
    assert report["missing_timestamps"] == 2
    assert report["timing_quality"] in ("warning", "bad")


def test_timing_validation_invalid_end_before_start():
    words = [
        {"start": 0.0, "end": 0.5, "word": "ok"},
        {"start": 1.0, "end": 0.5, "word": "bad"},
    ]
    report = validate_transcript_timing(words)
    assert report["invalid_timestamps"] == 1


def test_timing_validation_non_monotonic():
    words = [
        {"start": 0.0, "end": 0.5, "word": "first"},
        {"start": 0.3, "end": 0.8, "word": "overlap"},
    ]
    report = validate_transcript_timing(words)
    assert report["non_monotonic_pairs"] == 1


def test_timing_validation_empty_list():
    report = validate_transcript_timing([])
    assert report["word_count"] == 0
    assert report["timing_quality"] == "good"


def test_timing_validation_all_bad():
    words = [
        {"start": -1, "end": -1, "word": "a"},
        {"start": -1, "end": -1, "word": "b"},
    ]
    report = validate_transcript_timing(words)
    assert report["word_count"] == 2
    assert report["timing_quality"] == "bad"
