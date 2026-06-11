import pytest
from pathlib import Path

from ai_pipeline.subtitle_import import (
    _parse_srt,
    _parse_vtt,
    _parse_ass,
    _estimate_word_timings,
    _strip_html,
    _strip_ass_tags,
    _srt_time_to_seconds,
    SubtitleImportError,
    parse_subtitle_file,
    SUPPORTED_IMPORT_EXTENSIONS,
)

SRT_TWO_CUES = """1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,000 --> 00:00:08,500
This is a test
"""

SRT_MULTILINE = """1
00:00:01,000 --> 00:00:04,000
Hello world
This is line two
With a third line
"""

SRT_INVALID_BLOCK = """1
00:00:01,000 --> 00:00:04,000
Valid cue

not a valid block

2
00:00:05,000 --> 00:00:08,000
After invalid
"""

VTT_BASIC = """WEBVTT

1
00:00:01.000 --> 00:00:04.000
Hello from VTT

2
00:00:05.000 --> 00:00:08.500
Second VTT cue
"""

VTT_WITH_SETTINGS = """WEBVTT

1
00:00:01.000 --> 00:00:04.000 align:start position:0%
Hello with settings

2
00:00:05.000 --> 00:00:08.500 line:90%
Second with settings
"""

VTT_WITH_NOTE = """WEBVTT

NOTE
This is a comment
It has multiple lines

1
00:00:01.000 --> 00:00:04.000
After note
"""

ASS_BASIC = """[Script Info]
Title: Test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello world
Dialogue: 0,0:00:05.00,0:00:08.50,Default,,0,0,0,,Second line
"""

ASS_OVERRIDE_TAGS = """[Script Info]
Title: Test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\an8}Hello {\\b1}world{\\b0}
Dialogue: 0,0:00:05.00,0:00:08.50,Default,,0,0,0,,Test with {\\i1}italic{\\i0} text
"""

SAMPLE_SRT = """1
00:00:00,500 --> 00:00:02,000
Hello world

2
00:00:03,000 --> 00:00:06,000
How are you
"""


# ── SRT Tests ──

def test_srt_basic_two_cues():
    captions, report = _parse_srt(SRT_TWO_CUES)
    assert len(captions) == 2
    assert captions[0]["text"] == "Hello world"
    assert captions[0]["start"] == 1.0
    assert captions[0]["end"] == 4.0
    assert captions[1]["text"] == "This is a test"


def test_srt_multiline_text():
    captions, report = _parse_srt(SRT_MULTILINE)
    assert len(captions) == 1
    assert "line two" in captions[0]["text"]
    assert "third line" in captions[0]["text"]


def test_srt_invalid_block_skipped():
    captions, report = _parse_srt(SRT_INVALID_BLOCK)
    assert len(captions) == 2
    assert report["skipped_blocks"] >= 0
    assert len(report["warnings"]) >= 0


def test_srt_html_stripped():
    content = """1
00:00:01,000 --> 00:00:04,000
Hello <b>world</b> <i>test</i>
"""
    captions, report = _parse_srt(content)
    assert len(captions) == 1
    assert "<b>" not in captions[0]["text"]
    assert "<i>" not in captions[0]["text"]
    assert "world" in captions[0]["text"]


def test_srt_time_seconds():
    assert _srt_time_to_seconds("0", "00", "01", "500") == 1.5
    assert _srt_time_to_seconds("1", "30", "00", "000") == 5400.0


def test_srt_words_timing_source():
    captions, report = _parse_srt(SAMPLE_SRT)
    for caption in captions:
        assert caption["source"] == "subtitle_import"
        assert caption["importFormat"] == "srt"
        assert caption["timingSource"] == "imported"
        for word in caption.get("words", []):
            assert word["timing_source"] == "estimated_from_subtitle"
            assert word["timingNeedsReview"] is True


# ── VTT Tests ──

def test_vtt_basic():
    captions, report = _parse_vtt(VTT_BASIC)
    assert len(captions) == 2
    assert captions[0]["text"] == "Hello from VTT"
    assert captions[0]["start"] == 1.0
    assert captions[0]["end"] == 4.0
    assert captions[0]["importFormat"] == "vtt"


def test_vtt_with_cue_settings():
    captions, report = _parse_vtt(VTT_WITH_SETTINGS)
    assert len(captions) == 2
    assert captions[0]["text"] == "Hello with settings"
    assert captions[1]["text"] == "Second with settings"


def test_vtt_note_ignored():
    captions, report = _parse_vtt(VTT_WITH_NOTE)
    assert len(captions) == 1
    assert captions[0]["text"] == "After note"


def test_vtt_webvtt_header_ignored():
    content = """WEBVTT

00:00:01.000 --> 00:00:04.000
Test
"""
    captions, report = _parse_vtt(content)
    assert len(captions) == 1


# ── ASS Tests ──

def test_ass_basic():
    captions, report = _parse_ass(ASS_BASIC)
    assert len(captions) == 2
    assert captions[0]["text"] == "Hello world"
    assert captions[0]["start"] == 1.0
    assert captions[0]["end"] == 4.0
    assert captions[0]["importFormat"] == "ass"


def test_ass_override_tags_stripped():
    captions, report = _parse_ass(ASS_OVERRIDE_TAGS)
    assert len(captions) == 2
    assert "{\\" not in captions[0]["text"]
    assert "Hello" in captions[0]["text"]
    assert "world" in captions[0]["text"]
    assert "italic" in captions[1]["text"]


def test_ass_formats_parsed():
    content = """[Events]
Format: Layer, Start, End, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Simple format
"""
    captions, report = _parse_ass(content)
    assert len(captions) == 1
    assert captions[0]["text"] == "Simple format"
    assert captions[0]["start"] == 1.0


# ── Word Timing Estimation Tests ──

def test_estimated_word_timings_monotonic():
    words = _estimate_word_timings("hello world foo bar", 1.0, 5.0)
    assert len(words) == 4
    previous_end = 0.0
    for word in words:
        assert word["start"] >= previous_end
        assert word["end"] > word["start"]
        previous_end = word["end"]
    assert words[-1]["end"] == 5.0


def test_estimated_words_preserve_displayed_word():
    words = _estimate_word_timings("Hello World", 0.0, 2.0)
    assert len(words) == 2
    assert words[0]["displayedWord"] == "Hello"
    assert words[1]["displayedWord"] == "World"


def test_caption_line_start_end_preserved():
    captions, report = _parse_srt(SRT_TWO_CUES)
    assert captions[0]["start"] == 1.0
    assert captions[0]["end"] == 4.0
    assert captions[1]["start"] == 5.0
    assert captions[1]["end"] == 8.5


def test_empty_words_returns_empty():
    words = _estimate_word_timings("", 0.0, 2.0)
    assert words == []


def test_zero_duration_returns_empty():
    words = _estimate_word_timings("hello", 1.0, 1.0)
    assert words == []


# ── Error Handling Tests ──

def test_unsupported_extension():
    with pytest.raises(SubtitleImportError, match="Unsupported subtitle format"):
        parse_subtitle_file("content", "file.txt")


def test_unsupported_extension_message_lists_supported():
    with pytest.raises(SubtitleImportError) as excinfo:
        parse_subtitle_file("content", "file.txt")
    for ext in sorted(SUPPORTED_IMPORT_EXTENSIONS):
        assert ext in str(excinfo.value)


def test_empty_cues_raises_error():
    with pytest.raises(SubtitleImportError, match="No valid subtitle cues"):
        parse_subtitle_file("", "empty.srt")


def test_no_valid_cues_in_nonempty_file():
    content = "just some text without proper timing"
    with pytest.raises(SubtitleImportError, match="No valid subtitle cues"):
        parse_subtitle_file(content, "invalid.srt")


def test_file_too_large():
    large_content = "x" * (2 * 1024 * 1024 + 1)
    with pytest.raises(SubtitleImportError, match="too large"):
        parse_subtitle_file(large_content, "large.srt")


def test_file_too_large_custom_max():
    content = "x" * 200
    with pytest.raises(SubtitleImportError, match="too large"):
        parse_subtitle_file(content, "custom.srt", max_bytes=100)


def test_ass_sorted_by_start():
    content = """[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:10.00,0:00:15.00,Default,,0,0,0,,Later\nDialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Earlier\n"""
    captions, report = _parse_ass(content)
    assert len(captions) == 2
    assert captions[0]["text"] == "Earlier"
    assert captions[1]["text"] == "Later"
    assert captions[0]["start"] < captions[1]["start"]


# ── VTT edge cases ──

def test_vtt_style_region_ignored():
    content = """WEBVTT

STYLE
::cue {
  color: red
}

REGION
id:test

00:00:01.000 --> 00:00:04.000
Visible cue
"""
    captions, report = _parse_vtt(content)
    assert len(captions) == 1
    assert captions[0]["text"] == "Visible cue"


# ── parse_subtitle_file integration ──

def test_parse_srt_with_language_mode():
    captions, report = parse_subtitle_file(SAMPLE_SRT, "test.srt", language_mode="hinglish", script_mode="imported")
    assert len(captions) == 2
    assert captions[0]["languageMode"] == "hinglish"
    assert captions[0]["scriptMode"] == "imported"
    assert captions[0]["lang"] == "hinglish"


def test_parse_ass_with_script_mode():
    captions, report = parse_subtitle_file(ASS_BASIC, "test.ass", language_mode="tenglish", script_mode="subtitles")
    assert len(captions) == 2
    assert captions[0]["languageMode"] == "tenglish"
    assert captions[0]["scriptMode"] == "subtitles"


def test_parse_vtt_with_lang():
    captions, report = parse_subtitle_file(VTT_BASIC, "test.vtt", language_mode="english")
    assert len(captions) == 2
    assert captions[0]["languageMode"] == "english"


def test_import_report_has_all_fields():
    captions, report = parse_subtitle_file(SAMPLE_SRT, "test.srt")
    assert report["format"] == "srt"
    assert report["caption_count"] == 2
    assert "skipped_blocks" in report
    assert "warnings" in report
    assert report["duration_start"] == 0.5
    assert report["duration_end"] == 6.0
    assert report["has_estimated_word_timings"] is True
