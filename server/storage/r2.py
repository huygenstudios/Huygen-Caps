import os
import mimetypes
import logging
from pathlib import Path
from typing import Optional, BinaryIO
from datetime import datetime

try:
    import boto3
    from botocore.exceptions import ClientError
    from botocore.config import Config
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False

from .base import StorageAdapter, StoredObject, StorageError

logger = logging.getLogger(__name__)

class R2StorageAdapter(StorageAdapter):
    """
    Cloudflare R2 storage adapter.
    """
    
    backend_name = "r2"
    
    def __init__(self):
        if not BOTO3_AVAILABLE:
            raise StorageError("boto3 is required for R2 storage. Install it via pip install boto3.")
            
        self.account_id = os.getenv("R2_ACCOUNT_ID")
        self.access_key = os.getenv("R2_ACCESS_KEY_ID")
        self.secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
        self.bucket = os.getenv("R2_BUCKET_NAME") or os.getenv("R2_BUCKET")
        self.endpoint_url = os.getenv("R2_ENDPOINT_URL")
        self.public_base_url = (os.getenv("R2_PUBLIC_DOMAIN") or os.getenv("R2_PUBLIC_BASE_URL") or "").rstrip("/")
        self.region = os.getenv("R2_REGION", "auto")
        
        if not all([self.access_key, self.secret_key, self.bucket]):
            raise StorageError("R2 credentials missing. Ensure R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET are set.")
            
        if not self.endpoint_url:
            if not self.account_id:
                raise StorageError("Either R2_ENDPOINT_URL or R2_ACCOUNT_ID must be provided.")
            self.endpoint_url = f"https://{self.account_id}.r2.cloudflarestorage.com"
            
        self.client = boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=self.region,
            config=Config(signature_version="s3v4"),
        )

    def _guess_content_type(self, object_key: str, provided: Optional[str] = None) -> str:
        if provided:
            return provided
        mime_type, _ = mimetypes.guess_type(object_key)
        return mime_type or "application/octet-stream"

    def save_file(
        self,
        source: str | Path | bytes | BinaryIO,
        object_key: str,
        content_type: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> StoredObject:
        """Save file to R2 storage."""
        extra_args = {"ContentType": self._guess_content_type(object_key, content_type)}
        
        if metadata:
            s3_metadata = {}
            for k, v in metadata.items():
                if isinstance(v, datetime):
                    s3_metadata[k] = v.isoformat()
                else:
                    s3_metadata[k] = str(v)
            if s3_metadata:
                extra_args["Metadata"] = s3_metadata
                
        size_bytes = 0
        try:
            if isinstance(source, (str, Path)):
                source_path = Path(source)
                if not source_path.exists():
                    raise StorageError(f"Source file not found: {source_path}")
                size_bytes = source_path.stat().st_size
                self.client.upload_file(str(source_path), self.bucket, object_key, ExtraArgs=extra_args)
            elif isinstance(source, bytes):
                size_bytes = len(source)
                self.client.put_object(Bucket=self.bucket, Key=object_key, Body=source, **extra_args)
            else:
                # file-like object
                # for botocore to upload streams efficiently without seeking, it handles them via upload_fileobj
                # but size_bytes might be tricky, we'll try seeking or just assume None initially
                if hasattr(source, "read"):
                    self.client.upload_fileobj(source, self.bucket, object_key, ExtraArgs=extra_args)
                else:
                    raise StorageError("Unsupported source type for R2 upload.")
        except ClientError as e:
            raise StorageError(f"Failed to upload to R2: {e}")
            
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
            content_type=extra_args["ContentType"],
            size_bytes=size_bytes,
            storage_backend=self.backend_name,
            expires_at=expires_at,
            metadata=metadata,
        )

    def get_url(self, object_key: str, expires_in_seconds: Optional[int] = None) -> Optional[str]:
        """Get public or signed URL."""
        if self.public_base_url:
            return f"{self.public_base_url}/{object_key}"
            
        expires = expires_in_seconds or 3600
        try:
            url = self.client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": object_key},
                ExpiresIn=expires,
            )
            return url
        except ClientError as e:
            logger.error(f"Error generating presigned URL: {e}")
            return None

    def download_to_local(self, object_key: str, destination_path: str | Path) -> str:
        """Download file from R2 to local path."""
        dest = Path(destination_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            self.client.download_file(self.bucket, object_key, str(dest))
            return str(dest)
        except ClientError as e:
            raise StorageError(f"Failed to download from R2: {e}")

    def delete_file(self, object_key: str) -> bool:
        """Delete file from R2."""
        try:
            self.client.delete_object(Bucket=self.bucket, Key=object_key)
            return True
        except ClientError as e:
            logger.error(f"Failed to delete from R2: {e}")
            return False

    def exists(self, object_key: str) -> bool:
        """Check if file exists in R2."""
        try:
            self.client.head_object(Bucket=self.bucket, Key=object_key)
            return True
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code')
            if error_code == '404':
                return False
            raise StorageError(f"Error checking object existence: {e}")

    def get_local_path(self, object_key: str) -> Optional[str]:
        """R2 objects do not have a local path natively."""
        return None
