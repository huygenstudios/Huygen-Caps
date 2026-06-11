import asyncio
import logging
import os
import signal
import sys
from datetime import datetime, timezone

# Add the project root to PYTHONPATH so we can import 'server'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from server.export_queue import claim_next_export_job, requeue_stale_processing_jobs
from server.export_worker import _run_export_job_sync
from server.models import ExportRequest

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("export_worker")

# We want a clean shutdown
shutdown_event = asyncio.Event()

def handle_sigint(*args):
    logger.info("Received shutdown signal. Worker will exit after current job completes...")
    shutdown_event.set()

async def main(run_once=False):
    logger.info("Starting background export worker...")
    
    # Ensure export directories exist
    from server.api.export_jobs import EXPORT_DIR, ensure_runtime_dirs
    ensure_runtime_dirs()
    
    # Run a loop
    while not shutdown_event.is_set():
        try:
            # Periodically requeue stale jobs
            if int(datetime.now(timezone.utc).timestamp()) % 60 < 2: # simple throttle
                stale_count = await requeue_stale_processing_jobs(max_age_minutes=60)
                if stale_count > 0:
                    logger.warning(f"Requeued {stale_count} stale export jobs")

            # Try to claim a job
            job, request = await claim_next_export_job("worker_1")
            if not job or not request:
                if run_once:
                    logger.info("No jobs available. Running in --once mode, exiting.")
                    break
                # No job available, sleep and try again
                try:
                    await asyncio.wait_for(shutdown_event.wait(), timeout=2.0)
                except asyncio.TimeoutError:
                    pass
                continue

            logger.info(f"Claimed export job: {job.id}")
            
            # Run the export
            await _run_export_job_sync(job, request)
            
            if run_once:
                logger.info("Job processed. Running in --once mode, exiting.")
                break
            
        except Exception as e:
            logger.error(f"Unexpected error in export worker loop: {e}")
            if run_once:
                break
            await asyncio.sleep(5.0)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    args = parser.parse_args()

    signal.signal(signal.SIGINT, handle_sigint)
    if os.name != 'nt':
        signal.signal(signal.SIGTERM, handle_sigint)
        
    try:
        asyncio.run(main(run_once=args.once))
    except KeyboardInterrupt:
        pass
    logger.info("Export worker shutdown gracefully.")
