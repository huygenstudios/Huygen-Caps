"""Smoke test for subtitle import parser.

Creates small in-memory SRT, VTT, and ASS subtitle strings and verifies
the parser produces sane output. No API keys or external services required.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ai_pipeline.subtitle_import import parse_subtitle_file, _estimate_word_timings, SubtitleImportError

SAMPLE_SRT = """1
00:00:00,500 --> 00:00:02,000
Hello world

2
00:00:03,000 --> 00:00:06,000
How are you today

3
00:00:07,000 --> 00:00:10,500
This is a multi-line
subtitle example
"""

SAMPLE_VTT = """WEBVTT

1
00:00:00.500 --> 00:00:02.000
Hello from VTT

2
00:00:03.000 --> 00:00:06.000
VTT cue with settings align:start position:10%
"""

SAMPLE_ASS = """[Script Info]
Title: Smoke Test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello from ASS
Dialogue: 0,0:00:05.00,0:00:08.50,Default,,0,0,0,,{\\an8}ASS with {\\b1}tags{\\b0}
"""


def run_smoke():
    results = []

    # ── SRT ──
    try:
        srt_captions, srt_report = parse_subtitle_file(SAMPLE_SRT, "test.srt", language_mode="hinglish")
        results.append({
            "format": "SRT",
            "ok": True,
            "cue_count": srt_report["caption_count"],
            "first_cue": srt_captions[0]["text"][:50],
            "warnings": len(srt_report["warnings"]),
            "words_estimated": srt_report["has_estimated_word_timings"],
            "duration_range": f"{srt_report['duration_start']:.3f} - {srt_report['duration_end']:.3f}",
        })
    except SubtitleImportError as e:
        results.append({"format": "SRT", "ok": False, "error": str(e)})

    # ── VTT ──
    try:
        vtt_captions, vtt_report = parse_subtitle_file(SAMPLE_VTT, "test.vtt", language_mode="english")
        results.append({
            "format": "VTT",
            "ok": True,
            "cue_count": vtt_report["caption_count"],
            "first_cue": vtt_captions[0]["text"][:50],
            "warnings": len(vtt_report["warnings"]),
            "words_estimated": vtt_report["has_estimated_word_timings"],
            "duration_range": f"{vtt_report['duration_start']:.3f} - {vtt_report['duration_end']:.3f}",
        })
    except SubtitleImportError as e:
        results.append({"format": "VTT", "ok": False, "error": str(e)})

    # ── ASS ──
    try:
        ass_captions, ass_report = parse_subtitle_file(SAMPLE_ASS, "test.ass", language_mode="tenglish", script_mode="subtitles")
        results.append({
            "format": "ASS",
            "ok": True,
            "cue_count": ass_report["caption_count"],
            "first_cue": ass_captions[0]["text"][:50],
            "warnings": len(ass_report["warnings"]),
            "words_estimated": ass_report["has_estimated_word_timings"],
            "duration_range": f"{ass_report['duration_start']:.3f} - {ass_report['duration_end']:.3f}",
        })
    except SubtitleImportError as e:
        results.append({"format": "ASS", "ok": False, "error": str(e)})

    # ── Word timing estimation ──
    words = _estimate_word_timings("one two three four five", 0.0, 5.0)
    monotonic = all(
        words[i]["end"] > words[i]["start"] and
        (i == 0 or words[i]["start"] >= words[i - 1]["end"])
        for i in range(len(words))
    )
    results.append({
        "format": "TIMING",
        "ok": monotonic and len(words) == 5,
        "word_count": len(words),
        "monotonic": monotonic,
        "last_word_end": words[-1]["end"] if words else None,
    })

    # ── Summary ──
    print("=" * 60)
    print("  SUBTITLE IMPORT SMOKE TEST")
    print("=" * 60)
    all_ok = True
    for r in results:
        status = "PASS" if r["ok"] else "FAIL"
        if not r["ok"]:
            all_ok = False
        if r["format"] == "TIMING":
            print(f"  [{status}] Word timing estimation")
            print(f"         words={r['word_count']}, monotonic={r['monotonic']}")
        else:
            print(f"  [{status}] {r['format']}")
            if r["ok"]:
                print(f"         cues={r['cue_count']}, warnings={r['warnings']}, "
                      f"estimated={r['words_estimated']}, range={r['duration_range']}")
                print(f"         first cue: \"{r['first_cue']}\"")
            else:
                print(f"         error: {r['error']}")
        print()
    print("=" * 60)
    print(f"  RESULT: {'ALL PASSED' if all_ok else 'SOME FAILED'}")
    print("=" * 60)
    return all_ok


if __name__ == "__main__":
    success = run_smoke()
    sys.exit(0 if success else 1)
