import logging
from pathlib import Path
import sys

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from server.storage import get_storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("smoke_storage")

def run_smoke_test():
    storage = get_storage()
    logger.info(f"Active storage backend: {storage.backend_name}")
    
    # Create a dummy file
    dummy_file = Path("dummy_smoke_test.txt")
    dummy_file.write_text("Hello World!")
    
    object_key = "test/dummy_smoke_test.txt"
    try:
        # Save file
        logger.info(f"Saving file to {object_key}")
        storage.save_file(dummy_file, object_key, content_type="text/plain")
        
        # Check exists
        exists = storage.exists(object_key)
        logger.info(f"File exists: {exists}")
        assert exists, "File should exist after saving"
        
        # Get URL
        url = storage.get_url(object_key)
        logger.info(f"File URL: {url}")
        
        # Delete file
        logger.info(f"Deleting file {object_key}")
        storage.delete_file(object_key)
        
        # Check exists again
        exists = storage.exists(object_key)
        logger.info(f"File exists after deletion: {exists}")
        assert not exists, "File should not exist after deletion"
        
        logger.info("Smoke test passed successfully!")
    finally:
        if dummy_file.exists():
            dummy_file.unlink()

if __name__ == "__main__":
    run_smoke_test()
