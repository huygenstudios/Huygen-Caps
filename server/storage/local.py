import os
import shutil
import mimetypes
from pathlib import Path
from typing import Optional, BinaryIO
from datetime import datetime

from .base import StorageAdapter, StoredObject, StorageError
from ..settings import UPLOAD_DIR, EXPORT_DIR, ensure_runtime_dirs


class LocalStorageAdapter(StorageAdapter):
    """
    Local filesystem storage adapter.
    
    Uses the existing UPLOAD_DIR and EXPORT_DIR directories.
    Maintains backward compatibility with current file paths.
    """
    
    backend_name = "local"
    
    def __init__(self, base_dir: Optional[Path] = None):
        ensure_runtime_dirs()
        self.base_dir = Path(base_dir) if base_dir else UPLOAD_DIR.parent
        self.upload_dir = UPLOAD_DIR
        self.export_dir = EXPORT_DIR
    
    def _resolve_object_key(self, object_key: str) -> Path:
        """Resolve object key to local path. Handles both uploads and exports."""
        # Normalize the key
        safe_key = object_key.lstrip("/")
        
        # If it already contains job_id pattern, use it directly
        if safe_key.startswith("uploads/") or safe_key.startswith("exports/"):
            return self.base_dir / safe_key
        
        # For backward compatibility, check both uploads and exports
        upload_path = self.upload_dir / safe_key
        export_path = self.export_dir / safe_key
        
        if upload_path.exists():
            return upload_path
        if export_path.exists():
            return export_path
        
        # Default to uploads for new files unless it looks like an export
        if "/exports/" in object_key or object_key.startswith("exports/"):
            return self.export_dir / Path(object_key).name
            
        return self.upload_dir / safe_key
    
    def _guess_content_type(self, object_key: str, provided: Optional[str] = None) -> Optional[str]:
        """Guess content type from file extension or provided value."""
        if provided:
            return provided
        mime_type, _ = mimetypes.guess_type(object_key)
        return mime_type
    
    def save_file(
        self,
        source: str | Path | bytes | BinaryIO,
        object_key: str,
        content_type: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> StoredObject:
        """Save file to local storage."""
        dest_path = self._resolve_object_key(object_key)
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        
        size_bytes = 0
        
        if isinstance(source, (str, Path)):
            # Source is a file path
            source_path = Path(source)
            if not source_path.exists():
                raise StorageError(f"Source file not found: {source_path}")
            size_bytes = source_path.stat().st_size
            if source_path.resolve() != dest_path.resolve():
                shutil.copy2(source_path, dest_path)
        elif isinstance(source, bytes):
            # Source is bytes
            size_bytes = len(source)
            dest_path.write_bytes(source)
        else:
            # Source is file-like object
            with open(dest_path, "wb") as f:
                shutil.copyfileobj(source, f)
            size_bytes = dest_path.stat().st_size
        
        # Extract expires_at from metadata if provided
        expires_at = None
        if metadata and "expires_at" in metadata:
            exp_val = metadata["expires_at"]
            if isinstance(exp_val, str):
                expires_at = datetime.fromisoformat(exp_val)
            elif isinstance(exp_val, datetime):
                expires_at = exp_val
        
        return StoredObject(
            object_key=object_key,
            url=self.get_url(object_key),
            local_path=str(dest_path),
            content_type=self._guess_content_type(object_key, content_type),
            size_bytes=size_bytes,
            storage_backend=self.backend_name,
            expires_at=expires_at,
            metadata=metadata,
        )
    
    def get_url(self, object_key: str, expires_in_seconds: Optional[int] = None) -> Optional[str]:
        """Get local file URL. For local storage, returns relative path."""
        path = self._resolve_object_key(object_key)
        if not path.exists():
            return None
        
        # For local development, we serve via the /api/jobs/{job_id}/video endpoint
        # or /exports static mount. Return the relative path.
        if path.is_relative_to(self.upload_dir):
            rel = path.relative_to(self.upload_dir)
            # Find job_id if we used the format jobid_filename
            parts = str(rel).split("_", 1)
            if len(parts) == 2:
                job_id = parts[0]
                return f"/api/jobs/{job_id}/video"
            return f"/api/jobs/{str(rel)}/video"
        elif path.is_relative_to(self.export_dir):
            rel = path.relative_to(self.export_dir)
            return f"/exports/{rel}"
        
        return str(path)
    
    def download_to_local(self, object_key: str, destination_path: str | Path) -> str:
        """Copy local file to destination."""
        source_path = self._resolve_object_key(object_key)
        if not source_path.exists():
            raise StorageError(f"Object not found: {object_key}")
        
        dest = Path(destination_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if source_path.resolve() != dest.resolve():
            shutil.copy2(source_path, dest)
        return str(dest)
    
    def delete_file(self, object_key: str) -> bool:
        """Delete local file."""
        path = self._resolve_object_key(object_key)
        if path.exists():
            try:
                path.unlink()
                return True
            except OSError:
                return False
        return False
    
    def exists(self, object_key: str) -> bool:
        """Check if local file exists."""
        return self._resolve_object_key(object_key).exists()
    
    def get_local_path(self, object_key: str) -> Optional[str]:
        """Get local path for FFmpeg/Playwright access."""
        path = self._resolve_object_key(object_key)
        if path.exists():
            return str(path)
        return None