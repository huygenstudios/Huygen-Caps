import os
import pytest
from pathlib import Path
from datetime import datetime, timezone, timedelta

def test_local_storage_adapter(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("EXPORT_DIR", str(tmp_path / "exports"))
    
    from server.storage.local import LocalStorageAdapter
    adapter = LocalStorageAdapter()
    
    # Create a test file
    test_file = tmp_path / "test.txt"
    test_file.write_text("hello storage")
    
    # Test upload
    obj_key = "uploads/job123_video.mp4"
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    
    stored = adapter.save_file(
        test_file, 
        obj_key, 
        content_type="text/plain", 
        metadata={"expires_at": expires_at}
    )
    
    assert stored.object_key == obj_key
    assert stored.content_type == "text/plain"
    assert stored.size_bytes == len("hello storage")
    
    # Test exists
    assert adapter.exists(obj_key) is True
    
    # Test URL
    url = adapter.get_url(obj_key)
    assert url == "/api/jobs/job123/video"
    
    # Test delete
    adapter.delete_file(obj_key)
    assert adapter.exists(obj_key) is False

def test_local_storage_export(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("EXPORT_DIR", str(tmp_path / "exports"))
    
    from server.storage.local import LocalStorageAdapter
    adapter = LocalStorageAdapter()
    
    test_file = tmp_path / "export.mp4"
    test_file.write_bytes(b"fake mp4 data")
    
    obj_key = "exports/test_export.mp4"
    adapter.save_file(test_file, obj_key, content_type="video/mp4")
    
    url = adapter.get_url(obj_key)
    assert url == "/exports/test_export.mp4"
    
    adapter.delete_file(obj_key)
