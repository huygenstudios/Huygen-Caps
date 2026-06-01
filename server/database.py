import aiosqlite

from .settings import DB_PATH, ensure_runtime_dirs

async def init_db():
    # Ensure storage folder exists
    ensure_runtime_dirs()
    
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                progress INTEGER DEFAULT 0,
                filename TEXT NOT NULL,
                target_lang TEXT DEFAULT 'auto_mixed_indian',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                error TEXT,
                vtt_content TEXT,
                srt_content TEXT,
                segments_json TEXT,
                transcript_json TEXT
            )
        ''')
        await db.commit()

        # Migrate: add segments_json column if missing (for existing DBs)
        try:
            await db.execute("ALTER TABLE jobs ADD COLUMN segments_json TEXT")
            await db.commit()
        except Exception:
            pass  # Column already exists

        try:
            await db.execute("ALTER TABLE jobs ADD COLUMN transcript_json TEXT")
            await db.commit()
        except Exception:
            pass  # Column already exists

async def get_db():
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()
