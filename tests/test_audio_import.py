import pytest
from pathlib import Path
from unittest.mock import Mock, patch

from server.api.jobs import (
    ALLOWED_EXTENSIONS,
    ALLOWED_CONTENT_TYPES,
    ALLOWED_AUDIO_EXTENSIONS,
    ALLOWED_AUDIO_CONTENT_TYPES,
    MEDIA_KIND_BY_EXT,
    AUDIO_MIME_BY_EXT,
)


class TestConstants:
    def test_video_extensions_preserved(self):
        assert ".mp4" in ALLOWED_EXTENSIONS
        assert ".mov" in ALLOWED_EXTENSIONS
        assert ".m4v" in ALLOWED_EXTENSIONS

    def test_video_content_types_preserved(self):
        assert "video/mp4" in ALLOWED_CONTENT_TYPES
        assert "video/quicktime" in ALLOWED_CONTENT_TYPES
        assert "application/octet-stream" in ALLOWED_CONTENT_TYPES

    def test_audio_extensions_present(self):
        assert ".mp3" in ALLOWED_AUDIO_EXTENSIONS
        assert ".wav" in ALLOWED_AUDIO_EXTENSIONS
        assert ".m4a" in ALLOWED_AUDIO_EXTENSIONS
        assert ".ogg" in ALLOWED_AUDIO_EXTENSIONS

    def test_audio_content_types_present(self):
        assert "audio/mpeg" in ALLOWED_AUDIO_CONTENT_TYPES
        assert "audio/wav" in ALLOWED_AUDIO_CONTENT_TYPES
        assert "audio/x-wav" in ALLOWED_AUDIO_CONTENT_TYPES
        assert "audio/mp4" in ALLOWED_AUDIO_CONTENT_TYPES
        assert "audio/x-m4a" in ALLOWED_AUDIO_CONTENT_TYPES
        assert "audio/ogg" in ALLOWED_AUDIO_CONTENT_TYPES
        assert "application/octet-stream" in ALLOWED_AUDIO_CONTENT_TYPES

    def test_media_kind_mapping(self):
        assert MEDIA_KIND_BY_EXT[".mp3"] == "audio"
        assert MEDIA_KIND_BY_EXT[".wav"] == "audio"
        assert MEDIA_KIND_BY_EXT[".m4a"] == "audio"
        assert MEDIA_KIND_BY_EXT[".ogg"] == "audio"
        assert ".mp4" not in MEDIA_KIND_BY_EXT
        assert ".mov" not in MEDIA_KIND_BY_EXT

    def test_audio_mime_mapping(self):
        assert AUDIO_MIME_BY_EXT[".mp3"] == "audio/mpeg"
        assert AUDIO_MIME_BY_EXT[".wav"] == "audio/wav"
        assert AUDIO_MIME_BY_EXT[".m4a"] == "audio/mp4"
        assert AUDIO_MIME_BY_EXT[".ogg"] == "audio/ogg"


class TestValidateUploadMetadata:
    def _make_upload_file(self, filename: str, content_type: str = "video/mp4"):
        mock = Mock()
        mock.filename = filename
        mock.content_type = content_type
        return mock

    def test_video_mp4_accepted(self):
        from server.api.jobs import _validate_upload_metadata
        f = self._make_upload_file("test.mp4", "video/mp4")
        name, kind = _validate_upload_metadata(f)
        assert name.endswith(".mp4")
        assert kind == "video"

    def test_video_mov_accepted(self):
        from server.api.jobs import _validate_upload_metadata
        f = self._make_upload_file("test.mov", "video/quicktime")
        name, kind = _validate_upload_metadata(f)
        assert name.endswith(".mov")
        assert kind == "video"

    def test_audio_mp3_accepted(self):
        from server.api.jobs import _validate_upload_metadata
        f = self._make_upload_file("audio.mp3", "audio/mpeg")
        name, kind = _validate_upload_metadata(f)
        assert name.endswith(".mp3")
        assert kind == "audio"

    def test_audio_wav_accepted(self):
        from server.api.jobs import _validate_upload_metadata
        f = self._make_upload_file("audio.wav", "audio/wav")
        name, kind = _validate_upload_metadata(f)
        assert name.endswith(".wav")
        assert kind == "audio"

    def test_audio_m4a_accepted(self):
        from server.api.jobs import _validate_upload_metadata
        f = self._make_upload_file("audio.m4a", "audio/mp4")
        name, kind = _validate_upload_metadata(f)
        assert name.endswith(".m4a")
        assert kind == "audio"

    def test_audio_ogg_accepted(self):
        from server.api.jobs import _validate_upload_metadata
        f = self._make_upload_file("audio.ogg", "audio/ogg")
        name, kind = _validate_upload_metadata(f)
        assert name.endswith(".ogg")
        assert kind == "audio"

    def test_audio_with_octet_stream_accepted(self):
        from server.api.jobs import _validate_upload_metadata
        f = self._make_upload_file("audio.mp3", "application/octet-stream")
        name, kind = _validate_upload_metadata(f)
        assert kind == "audio"

    def test_video_with_octet_stream_accepted(self):
        from server.api.jobs import _validate_upload_metadata
        f = self._make_upload_file("video.mp4", "application/octet-stream")
        name, kind = _validate_upload_metadata(f)
        assert kind == "video"

    def test_rejects_unsupported_extension(self):
        from server.api.jobs import _validate_upload_metadata
        from fastapi import HTTPException
        f = self._make_upload_file("bad.txt", "text/plain")
        with pytest.raises(HTTPException, match="Unsupported file type"):
            _validate_upload_metadata(f)

    def test_rejects_unsupported_audio_type(self):
        from server.api.jobs import _validate_upload_metadata
        from fastapi import HTTPException
        f = self._make_upload_file("test.mp3", "video/mp4")
        with pytest.raises(HTTPException, match="Unsupported media type"):
            _validate_upload_metadata(f)

    def test_rejects_unsupported_video_type(self):
        from server.api.jobs import _validate_upload_metadata
        from fastapi import HTTPException
        f = self._make_upload_file("test.mp4", "audio/mpeg")
        with pytest.raises(HTTPException, match="Unsupported media type"):
            _validate_upload_metadata(f)

    def test_sanitizes_filename(self):
        from server.api.jobs import _validate_upload_metadata
        f = self._make_upload_file("hello<>world.mp4", "video/mp4")
        name, kind = _validate_upload_metadata(f)
        assert ">" not in name
        assert "<" not in name
        assert name.endswith(".mp4")

    def test_sanitizes_audio_filename(self):
        from server.api.jobs import _validate_upload_metadata
        f = self._make_upload_file("hello<>world.mp3", "audio/mpeg")
        name, kind = _validate_upload_metadata(f)
        assert ">" not in name
        assert "<" not in name
        assert name.endswith(".mp3")
        assert kind == "audio"


class TestAudioDurationValidation:
    def test_audio_mime_by_ext(self):
        assert AUDIO_MIME_BY_EXT[".mp3"] == "audio/mpeg"
        assert AUDIO_MIME_BY_EXT[".wav"] == "audio/wav"
        assert AUDIO_MIME_BY_EXT[".m4a"] == "audio/mp4"


class TestBackwardCompat:
    def test_video_upload_unchanged(self):
        from server.api.jobs import _validate_upload_metadata
        f = Mock()
        f.filename = "video.MP4"
        f.content_type = "video/mp4"
        name, kind = _validate_upload_metadata(f)
        assert kind == "video"
        assert name.lower().endswith(".mp4")
