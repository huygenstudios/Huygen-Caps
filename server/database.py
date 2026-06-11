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

        try:
            await db.execute("ALTER TABLE jobs ADD COLUMN media_kind TEXT DEFAULT 'video'")
            await db.commit()
        except Exception:
            pass  # Column already exists

        try:
            await db.execute("ALTER TABLE jobs ADD COLUMN storage_backend TEXT DEFAULT 'local'")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE jobs ADD COLUMN object_key TEXT")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE jobs ADD COLUMN expires_at TIMESTAMP")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE jobs ADD COLUMN user_id TEXT")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE jobs ADD COLUMN anonymous_session_id TEXT")
            await db.commit()
        except Exception:
            pass



        await db.execute('''
            CREATE TABLE IF NOT EXISTS export_jobs (
                id TEXT PRIMARY KEY,
                source_job_id TEXT NOT NULL,
                status TEXT NOT NULL,
                stage TEXT NOT NULL,
                progress INTEGER DEFAULT 0,
                message TEXT DEFAULT '',
                error TEXT,
                download_url TEXT,
                filename TEXT,
                output_path TEXT,
                bytes INTEGER,
                duration REAL,
                width INTEGER,
                height INTEGER,
                fps INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        ''')
        await db.commit()

        try:
            await db.execute("ALTER TABLE export_jobs ADD COLUMN storage_backend TEXT DEFAULT 'local'")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE export_jobs ADD COLUMN object_key TEXT")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE export_jobs ADD COLUMN expires_at TIMESTAMP")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE export_jobs ADD COLUMN user_id TEXT")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE export_jobs ADD COLUMN anonymous_session_id TEXT")
            await db.commit()
        except Exception:
            pass

        # Stage 1I Closure Migrations
        try:
            await db.execute("ALTER TABLE export_jobs ADD COLUMN request_payload TEXT")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE export_jobs ADD COLUMN attempts INTEGER DEFAULT 0")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE export_jobs ADD COLUMN max_attempts INTEGER DEFAULT 2")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE export_jobs ADD COLUMN error_code TEXT")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE export_jobs ADD COLUMN content_type TEXT")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE export_jobs ADD COLUMN started_at TIMESTAMP")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE export_jobs ADD COLUMN completed_at TIMESTAMP")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE export_jobs ADD COLUMN locked_at TIMESTAMP")
            await db.commit()
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE export_jobs ADD COLUMN locked_by TEXT")
            await db.commit()
        except Exception:
            pass

        # Auth and Usage tables
        await db.execute('''
            CREATE TABLE IF NOT EXISTS user_profiles (
                id TEXT PRIMARY KEY,
                supabase_user_id TEXT UNIQUE,
                email TEXT,
                display_name TEXT,
                plan_key TEXT DEFAULT 'free',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        await db.execute('''
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                title TEXT,
                source_job_id TEXT,
                caption_document_id TEXT,
                media_kind TEXT,
                storage_backend TEXT,
                object_key TEXT,
                status TEXT,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        await db.execute('''
            CREATE TABLE IF NOT EXISTS usage_events (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                anonymous_session_id TEXT,
                event_type TEXT,
                media_duration_sec REAL,
                provider TEXT,
                storage_backend TEXT,
                job_id TEXT,
                export_job_id TEXT,
                cost_estimate REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        await db.execute('''
            CREATE TABLE IF NOT EXISTS plan_entitlements (
                plan_key TEXT PRIMARY KEY,
                generation_minutes_monthly INTEGER,
                exports_per_day INTEGER,
                max_upload_duration_sec INTEGER,
                watermark_required INTEGER DEFAULT 1,
                hd_export_allowed INTEGER DEFAULT 0,
                retention_hours INTEGER DEFAULT 24
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS subscriptions (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                plan_key TEXT,
                status TEXT,
                razorpay_customer_id TEXT,
                razorpay_subscription_id TEXT,
                razorpay_plan_id TEXT,
                current_period_start TIMESTAMP,
                current_period_end TIMESTAMP,
                cancel_at_period_end INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                raw_status TEXT
            )
        ''')

        await db.execute('''
            CREATE TABLE IF NOT EXISTS billing_events (
                id TEXT PRIMARY KEY,
                razorpay_event_id TEXT UNIQUE,
                event_type TEXT,
                user_id TEXT,
                razorpay_subscription_id TEXT,
                payload_json TEXT,
                processed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Seed free, creator, pro plans
        async with db.execute("SELECT COUNT(*) FROM plan_entitlements") as cursor:
            row = await cursor.fetchone()
            if row and row[0] == 0:
                from .settings import FREE_PLAN_GENERATION_MINUTES, FREE_PLAN_EXPORTS_PER_DAY
                await db.execute('''
                    INSERT INTO plan_entitlements 
                    (plan_key, generation_minutes_monthly, exports_per_day, max_upload_duration_sec, watermark_required, hd_export_allowed, retention_hours)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', ('free', FREE_PLAN_GENERATION_MINUTES, FREE_PLAN_EXPORTS_PER_DAY, 120, 1, 0, 24))
                await db.execute('''
                    INSERT INTO plan_entitlements 
                    (plan_key, generation_minutes_monthly, exports_per_day, max_upload_duration_sec, watermark_required, hd_export_allowed, retention_hours)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', ('creator', 300, 50, 300, 0, 1, 168))
                await db.execute('''
                    INSERT INTO plan_entitlements 
                    (plan_key, generation_minutes_monthly, exports_per_day, max_upload_duration_sec, watermark_required, hd_export_allowed, retention_hours)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', ('pro', 1000, 200, 900, 0, 1, 720))
        
        # In case the table already existed but only had 'free', let's upsert creator/pro if missing
        try:
            await db.execute('''
                INSERT OR IGNORE INTO plan_entitlements 
                (plan_key, generation_minutes_monthly, exports_per_day, max_upload_duration_sec, watermark_required, hd_export_allowed, retention_hours)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', ('creator', 300, 50, 300, 0, 1, 168))
            await db.execute('''
                INSERT OR IGNORE INTO plan_entitlements 
                (plan_key, generation_minutes_monthly, exports_per_day, max_upload_duration_sec, watermark_required, hd_export_allowed, retention_hours)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', ('pro', 1000, 200, 900, 0, 1, 720))
        except Exception:
            pass
        
        await db.commit()

async def get_db():
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()
