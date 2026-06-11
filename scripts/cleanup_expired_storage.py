import asyncio
import logging
from datetime import datetime, timezone
import aiosqlite
import sys
from pathlib import Path

# Add project root to sys.path
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from server.settings import DB_PATH
from server.storage.local import LocalStorageAdapter
try:
    from server.storage.r2 import R2StorageAdapter
except ImportError:
    R2StorageAdapter = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("cleanup_script")

async def cleanup_expired():
    logger.info("Starting expired storage cleanup...")
    
    local_storage = LocalStorageAdapter()
    r2_storage = R2StorageAdapter() if R2StorageAdapter else None

    def delete_from_storage(backend: str, object_key: str):
        if not object_key:
            return
        try:
            if backend == "r2" and r2_storage:
                if r2_storage.exists(object_key):
                    r2_storage.delete_file(object_key)
                    logger.info(f"Deleted R2 object: {object_key}")
            elif backend == "local":
                if local_storage.exists(object_key):
                    local_storage.delete_file(object_key)
                    logger.info(f"Deleted local object: {object_key}")
            else:
                logger.warning(f"Unknown or unavailable storage backend '{backend}' for key: {object_key}")
        except Exception as e:
            logger.error(f"Failed to delete {object_key} from {backend}: {e}")

    now = datetime.now(timezone.utc).isoformat()
    
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        
        # Cleanup Jobs
        cursor = await db.execute("SELECT id, storage_backend, object_key FROM jobs WHERE expires_at IS NOT NULL AND expires_at < ?", (now,))
        expired_jobs = await cursor.fetchall()
        for job in expired_jobs:
            logger.info(f"Cleaning up expired job: {job['id']}")
            delete_from_storage(job['storage_backend'], job['object_key'])
            await db.execute("DELETE FROM jobs WHERE id = ?", (job['id'],))
            
        # Cleanup Export Jobs
        cursor = await db.execute("SELECT id, storage_backend, object_key FROM export_jobs WHERE expires_at IS NOT NULL AND expires_at < ?", (now,))
        expired_exports = await cursor.fetchall()
        for exp in expired_exports:
            logger.info(f"Cleaning up expired export_job: {exp['id']}")
            delete_from_storage(exp['storage_backend'], exp['object_key'])
            await db.execute("DELETE FROM export_jobs WHERE id = ?", (exp['id'],))

        await db.commit()
        
    logger.info(f"Cleanup complete. Deleted {len(expired_jobs)} jobs and {len(expired_exports)} export jobs.")

if __name__ == "__main__":
    asyncio.run(cleanup_expired())
