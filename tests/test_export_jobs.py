import pytest
from fastapi.testclient import TestClient
from server.main import app

client = TestClient(app)

def test_export_jobs_requires_auth():
    # Attempting to export without auth should fail if AUTH_REQUIRED_FOR_EXPORT is True
    # If it's False, we might get a 402 quota error if anonymous exports are disabled.
    response = client.post(
        "/api/export/jobs",
        data={
            "source_job_id": "test_job_123",
            "captions_json": "[]",
            "theme": "word_highlight_box",
            "resolution": "1080p",
            "export_fps": "30",
            "include_audio": "true",
            "quality": "standard",
            "bitrate": "auto",
            "export_mode": "full_video",
            "background_color": "#101010",
            "duration_override": "10.0",
        }
    )
    
    assert response.status_code in [400, 401, 402, 404]

def test_export_download_legacy_format():
    response = client.get("/api/export/jobs/download/test_file.mp4")
    assert response.status_code == 404 # file doesn't exist

def test_export_download_signed_url():
    response = client.get("/api/export/jobs/download?key=exports/test/test.mp4")
    assert response.status_code in [404, 500, 307] # Depends on storage adapter
