from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional, BinaryIO


class StorageError(Exception):
    """Base exception for storage errors."""
    pass


@dataclass
class StoredObject:
    object_key: str
    content_type: Optional[str]
    size_bytes: int
    storage_backend: str
    url: Optional[str] = None
    local_path: Optional[str] = None
    expires_at: Optional[datetime] = None
    metadata: Optional[dict] = None


class StorageAdapter(ABC):
    """Base interface for all storage backends."""

    backend_name: str

    @abstractmethod
    def save_file(
        self,
        source: str | Path | bytes | BinaryIO,
        object_key: str,
        content_type: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> StoredObject:
        """Save a file/bytes to storage."""
        pass

    @abstractmethod
    def get_url(self, object_key: str, expires_in_seconds: Optional[int] = None) -> Optional[str]:
        """Get a URL (public or signed) to access the file."""
        pass

    @abstractmethod
    def download_to_local(self, object_key: str, destination_path: str | Path) -> str:
        """Download file from storage to a local path."""
        pass

    @abstractmethod
    def delete_file(self, object_key: str) -> bool:
        """Delete file from storage."""
        pass

    @abstractmethod
    def exists(self, object_key: str) -> bool:
        """Check if file exists in storage."""
        pass

    @abstractmethod
    def get_local_path(self, object_key: str) -> Optional[str]:
        """
        Get local path if it is backed by local storage or has been downloaded.
        Returns None for remote objects that haven't been downloaded.
        """
        pass