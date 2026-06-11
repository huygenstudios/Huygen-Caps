import pytest
import aiosqlite
import os
import uuid
import json
from server.database import init_db
from server.settings import DB_PATH
from server.models import ExportRequest
from server.export_queue import (
    enqueue_export_job, claim_next_export_job, get_export_history, 
    mark_export_stage, mark_export_completed, mark_export_failed, 
    retry_export_job, requeue_stale_processing_jobs
)
from server.api.export_jobs import _load_job_from_db

@pytest.fixture(autouse=True)
def setup_db():
    import asyncio
    async def _setup():
        await init_db()
        async with aiosqlite.connect(str(DB_PATH)) as db:
            await db.execute("DELETE FROM export_jobs")
            await db.commit()
    asyncio.run(_setup())
    yield

def make_dummy_request():
    return ExportRequest(
        source_job_id="test_source_id",
        captions_json="[]",
        theme="word_highlight_box",
        style_config_json=None,
        resolution="1080p",
        export_width=1920,
        export_height=1080,
        export_fps=30,
        include_audio=True,
        quality="standard",
        bitrate="auto",
        custom_bitrate_mbps=None,
        export_mode="full_video",
        captions_only=False,
        background_color="#101010",
        duration_override=10.0,
        duration_source="timeline",
        visible_tracks_count=1,
        source_media_count=1,
        caption_chunks_count=1,
        hardware_acceleration=False,
        render_mode="headless",
        original_video_path="",
        composition_json=None,
    )

@pytest.mark.anyio
async def test_enqueue_creates_queued_job():
    req = make_dummy_request()
    job_id = str(uuid.uuid4())
    job = await enqueue_export_job("test_src", "user1", None, req, job_id)
    assert job.status == "queued"
    assert job.id == job_id
    assert job.stage == "queued"
    assert job.progress == 0

@pytest.mark.anyio
async def test_claim_next_export_job_locks():
    req = make_dummy_request()
    job_id = str(uuid.uuid4())
    await enqueue_export_job("test_src", "user1", None, req, job_id)
    
    claimed_job, claimed_req = await claim_next_export_job("worker_1")
    assert claimed_job is not None
    assert claimed_job.id == job_id
    assert claimed_job.status == "running"
    
    # Try to claim again, should be None
    claimed_job_2, _ = await claim_next_export_job("worker_2")
    assert claimed_job_2 is None

@pytest.mark.anyio
async def test_mark_export_stage():
    req = make_dummy_request()
    job_id = str(uuid.uuid4())
    await enqueue_export_job("test_src", "user1", None, req, job_id)
    
    await claim_next_export_job("worker_1")
    await mark_export_stage(job_id, "running", "rendering_frames", 50, "Rendering...")
    
    job = await _load_job_from_db(job_id)
    assert job.stage == "rendering_frames"
    assert job.progress == 50
    assert job.message == "Rendering..."

@pytest.mark.anyio
async def test_mark_export_completed():
    req = make_dummy_request()
    job_id = str(uuid.uuid4())
    await enqueue_export_job("test_src", "user1", None, req, job_id)
    await claim_next_export_job("worker_1")
    
    await mark_export_completed(job_id, "local", "some_key.mp4", "/dl/some_key.mp4", "file.mp4", "/path", 1024, 1920, 1080)
    job = await _load_job_from_db(job_id)
    assert job.status == "completed"
    assert job.progress == 100
    assert job.object_key == "some_key.mp4"
    assert job.storage_backend == "local"

@pytest.mark.anyio
async def test_mark_export_failed():
    req = make_dummy_request()
    job_id = str(uuid.uuid4())
    await enqueue_export_job("test_src", "user1", None, req, job_id)
    await claim_next_export_job("worker_1")
    
    await mark_export_failed(job_id, "rendering", "It broke", "Error details")
    job = await _load_job_from_db(job_id)
    assert job.status == "failed"
    assert job.progress == -1
    assert job.error == "Error details"

@pytest.mark.anyio
async def test_retry_failed_job():
    req = make_dummy_request()
    job_id = str(uuid.uuid4())
    await enqueue_export_job("test_src", "user1", None, req, job_id)
    await claim_next_export_job("worker_1")
    await mark_export_failed(job_id, "rendering", "It broke", "Error details")
    
    success, msg = await retry_export_job(job_id, "user1", None)
    assert success is True
    
    job = await _load_job_from_db(job_id)
    assert job.status == "queued"
    assert job.error is None
    assert job.stage == "queued"

@pytest.mark.anyio
async def test_retry_unauthorized():
    req = make_dummy_request()
    job_id = str(uuid.uuid4())
    await enqueue_export_job("test_src", "user1", None, req, job_id)
    await claim_next_export_job("worker_1")
    await mark_export_failed(job_id, "rendering", "It broke", "Error details")
    
    success, msg = await retry_export_job(job_id, "wrong_user", None)
    assert success is False
    assert "Unauthorized" in msg

@pytest.mark.anyio
async def test_history_ordering():
    req = make_dummy_request()
    
    job1 = str(uuid.uuid4())
    job2 = str(uuid.uuid4())
    
    await enqueue_export_job("test_src", "user_history", None, req, job1)
    # small delay to ensure created_at differs
    import asyncio
    await asyncio.sleep(0.01)
    await enqueue_export_job("test_src", "user_history", None, req, job2)
    
    history = await get_export_history("user_history", None)
    assert len(history) == 2
    # Should be descending created_at
    assert history[0].id == job2
    assert history[1].id == job1

@pytest.mark.anyio
async def test_requeue_stale_processing_jobs():
    req = make_dummy_request()
    job_id = str(uuid.uuid4())
    await enqueue_export_job("test_src", "user1", None, req, job_id)
    await claim_next_export_job("worker_1")
    
    # Manually backdate the locked_at to force stale
    import datetime
    stale_time = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=40)).isoformat()
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute("UPDATE export_jobs SET locked_at = ?, updated_at = ? WHERE id = ?", (stale_time, stale_time, job_id))
        await db.commit()
    
    count = await requeue_stale_processing_jobs(max_age_minutes=30)
    assert count == 1
    
    job = await _load_job_from_db(job_id)
    assert job.status == "queued"
