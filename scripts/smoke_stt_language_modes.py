"""Smoke check: STT language mode configs without requiring API keys.

Run:
    python scripts/smoke_stt_language_modes.py

Prints each supported language mode's config and whether it is production-ready.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ai_pipeline.language_modes import (
    SUPPORTED_LANGUAGE_MODES,
    get_stt_language_config,
    normalize_language_mode,
    validate_transcript_timing,
)

LEGACY_TESTS = {
    "telgish": "tenglish",
    "teluglish": "tenglish",
    "auto_indian_mixed": "auto_mixed_indian",
    "auto": "auto_mixed_indian",
    "": "auto_mixed_indian",
}

BORDER = "=" * 60
SEP = "-" * 40


def main() -> None:
    print(BORDER)
    print("Smoke: STT Language Mode Configs")
    print(BORDER)

    all_ok = True

    for mode in SUPPORTED_LANGUAGE_MODES:
        config = get_stt_language_config(mode)
        ready = "PRODUCTION-READY" if config.get("production_ready") else "TODO / NOT PRODUCTION-READY"
        print(f"\n  Mode:         {mode}")
        print(f"  Provider:     {config['provider']}")
        print(f"  Language:     {config['language_code']}")
        print(f"  Sarvam mode:  {config['sarvam_mode']}")
        print(f"  Script:       {config['script_mode']}")
        print(f"  Display:      {config['display_mode']}")
        print(f"  Status:       {ready}")
        if config.get("notes"):
            print(f"  Notes:        {config['notes']}")

    print(f"\n{SEP}")
    print("Legacy alias normalization:")
    print(SEP)

    for legacy, expected in LEGACY_TESTS.items():
        try:
            result = normalize_language_mode(legacy)
            ok = result == expected
            status = "OK" if ok else f"FAIL (expected {expected}, got {result})"
            if not ok:
                all_ok = False
        except Exception as exc:
            status = f"ERROR: {exc}"
            all_ok = False
        print(f"  {legacy!r:25} -> {expected!r:25} {status}")

    print(f"\n{SEP}")
    print("Legacy values mapped to STT config:")
    print(SEP)

    for legacy in ["telgish", "teluglish", "auto_indian_mixed"]:
        config = get_stt_language_config(legacy)
        print(f"  {legacy:25} -> {config['display_mode']} ({config['sarvam_mode']})")

    print(f"\n{SEP}")
    print("Timing validation smoke:")
    print(SEP)

    good_words = [
        {"start": 0.0, "end": 0.5, "word": "hello"},
        {"start": 0.5, "end": 1.0, "word": "world"},
    ]
    bad_words = [
        {"start": -1, "end": -1, "word": "bad"},
        {"start": 1.0, "end": 0.5, "word": "inverted"},
    ]

    for label, words in [("good", good_words), ("bad", bad_words), ("empty", [])]:
        report = validate_transcript_timing(words)
        print(f"  {label:8} -> quality={report['timing_quality']}, "
              f"words={report['word_count']}, missing={report['missing_timestamps']}, "
              f"invalid={report['invalid_timestamps']}, non_monotonic={report['non_monotonic_pairs']}")

    print(f"\n{BORDER}")
    if all_ok:
        print("All smoke checks PASSED.")
    else:
        print("Some smoke checks FAILED — review output above.")
    print(BORDER)

    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()