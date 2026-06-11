import os
from .base import StorageAdapter, StoredObject, StorageError
from .local import LocalStorageAdapter

# We lazy load R2StorageAdapter to not crash if boto3 isn't installed and R2 isn't used
_adapter_instance = None

def get_storage() -> StorageAdapter:
    """
    Factory function to get the configured storage adapter.
    Caches the instance after first initialization.
    """
    global _adapter_instance
    if _adapter_instance is not None:
        return _adapter_instance
        
    backend = os.getenv("STORAGE_BACKEND", "local").lower()
    
    if backend == "r2":
        from .r2 import R2StorageAdapter
        _adapter_instance = R2StorageAdapter()
    else:
        _adapter_instance = LocalStorageAdapter()
        
    return _adapter_instance

__all__ = ["StorageAdapter", "StoredObject", "StorageError", "get_storage"]