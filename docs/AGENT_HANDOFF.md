# Agent Handoff Document

Last updated: **2026-06-11** by OpenCode (DeepSeek V4 Pro) — Stage 1K-B

---

## 1. Project Summary

**Capinsta / Huygen Caps** is a caption-first AI subtitle generator. It has a Next.js frontend, FastAPI backend, AI pipeline, caption editor, word-level transcript handling, preview renderer, and Playwright/FFmpeg export pipeline.

## 2. Hosting Target

**Hostinger VPS KVM 1 + Coolify** (resource-limited).

## 3. Resource Constraints

| Constraint | Value |
|---|---|
| vCPUs | 1 |
| Export concurrency | 1 (MUST NOT increase) |
| External storage | Cloudflare R2 (planned, not implemented) |
| DB/Auth | Supabase (planned, not implemented) |
| Queue | Redis (planned, not implemented) |

**Do not implement R2, Supabase, Redis, or Razorpay unless explicitly part of a new task.**

## 4. Current Stage 1 Direction

- **Stage 1D:** Fixed timing alignment logic across words/chunks and provider bugs. Added robust chunk parsing.
- **Stage 1E:** Enhanced error handling and recovery (JSON parsing fallbacks, timeout boundaries, fallback defaults).
- **Stage 1E:** Audio import parsing, FFmpeg extraction, audio-only preflight. *COMPLETED*
- **Stage 1F:** Abstract storage adapter, Local/R2 support, STT/Export adapters. *COMPLETED*
- **Stage 1G:** Supabase auth UI integration, JWT backend verification, `usage.py` logic. *COMPLETED*
- `telugu_roman` | `tenglish` |
- **Stage 1H:** Razorpay subscriptions, webhooks, frontend billing integration. *COMPLETED*
- **Stage 1I:** Export system hardening (Auth/Quota gates, StorageAdapter upload, Playwright retry logic). *COMPLETED*
- **Stage 1J:** Mobile Job Persistence (durable React hooks, `JobStatusBanner`), Workflow Guardrails, and Stage 1 Launch Benchmark verification (`benchmark_stage1_launch.py`). *COMPLETED*
- **Stage 1K:** Hostinger KVM 1 / Coolify Production Deployment Gate (Deployment scripts, docs, env stabilization). *COMPLETED*
- **Stage 1K-B:** Live Deployment Verification Checklist & Sanity Scripts. *COMPLETED*
- **Stage 2A:** Razorpay Billing Pages (Frontend `/billing` flow, success polling, checkout redirects, quota UI integration). *COMPLETED*

**Next up:** Deepgram integration (Stage 2 fallback STT provider) or style enhancements.

Working caption generator with multiple Indian language modes, export pipeline, modern UI, billing integration, and robust state persistence. Deepgram is planned as a fallback STT provider but is NOT production-ready yet.

## 5. What Antigravity Already Changed

1. Frontend wording changed from legacy `telgish` to canonical `tenglish`.
2. `CaptionEditorPanel` mappings updated: `OriginalLanguageOption`, `TranslateOption`, labels, fallback/default logic, `languageModeFromSelection`.
3. `CaptionBlock` CSS changed from `lang-telgish` to `lang-tenglish`.
4. Global CSS changed `.caption-block.lang-telgish` to `.caption-block.lang-tenglish`.
5. `.env.example` got placeholders for Supabase, R2, and DEEPGRAM_API_KEY.
6. `ai_pipeline/transcriber.py` got Deepgram API key presence checks in `_resolve_provider()`.
7. `transcriber.py -> transcribe_audio()` got `NotImplementedError` scaffolding for Deepgram STT.
8. `server/settings.py` checked for KVM 1 concurrency minimums.

## 6. What This OpenCode (DeepSeek V4 Pro) Pass Changed

1. **Created this AGENT_HANDOFF.md**.
2. **Fixed outdated tests** — `test_language_provider_errors.py` now asserts canonical `tenglish`.
3. **Added `telugu_roman` alias** → `tenglish` in `_LANGUAGE_ALIASES`.
4. **Gated Deepgram auto-selection** — `_resolve_provider()` now skips Deepgram in auto mode unless `STT_DEEPGRAM_ENABLED=true` env var is set.
5. **Deepgram explicit selection returns controlled error** — not a crash.
6. **Updated `CaptionEditorPanel.tsx`** — removed `Teluglish` from product-facing labels.
7. **Updated `README.md`** — migrated `Telgish / Teluglish` references to `Tenglish`.
8. **Updated `docs/ARCHITECTURE.md`** — language modes list now shows `tenglish`.
9. **Updated `.env.example`** — Deepgram comments clarify it is not production-ready.

## 7. Current Language Mode Canonical Values

| Internal Value | Display Label | Description |
|---|---|---|
| `english` | English | English speech to English captions |
| `telugu` | Telugu | Telugu speech to Telugu native script captions |
| `hindi` | Hindi | Hindi speech to Devanagari captions |
| `hinglish` | Hinglish | Hindi-English speech in Roman/English letters |
| `tenglish` | Tenglish | Telugu/Telugu-English speech in Roman/English letters |
| `auto_mixed_indian` | Auto Indian Mixed | Mixed Indian-language speech, preserve mixed words |
| `english_translation` | English Translation | Translate Indic speech to English captions |

## 8. Backward Compatibility Mappings

All handled by `normalize_language_mode()` in `ai_pipeline/language_modes.py`:

| Old Value | Normalizes To |
|---|---|
| `telgish` | `tenglish` |
| `teluglish` | `tenglish` |
| `telugu_roman` | `tenglish` |
| `auto_indian_mixed` | `auto_mixed_indian` |
| `Auto Mixed Indian` (with underscores) | `auto_mixed_indian` |
| `""` / `null` / `auto` | `auto_mixed_indian` |

**Naming rule:** Product-facing UI must say `Tenglish`, never `Telgish` or `Teluglish`.

## 9. Current Deepgram Status

**Deepgram is not fully implemented yet.**

- `_resolve_provider()` will NOT auto-select Deepgram even if `DEEPGRAM_API_KEY` is set.
- To enable Deepgram auto-selection: set `STT_DEEPGRAM_ENABLED=true` env var (future).
- Explicit provider selection of `deepgram` returns: `"Deepgram STT is configured but not implemented yet"`.
- Current primary STT path: **Sarvam** for Indian/code-mixed captions.

## 10. Next Recommended Task After This Pass

Stage 1 implementation is complete.
Stage 1K live deployment verification checklist is ready.
Stage 2 should start only after live production smoke passes.

Start working on **Stage 2** which may include:
- Deepgram STT Integration (using the `STT_DEEPGRAM_ENABLED` flag).
- Billing Settings Frontend UI.
- Multi-track timeline optimizations.

## 11. Known Deployment Risks
- **Concurrency:** Ensure `EXPORT_CONCURRENCY=1` and `WORKER_CONCURRENCY=1` are set on KVM 1 servers to prevent OOM kills.
- **Shared Volume:** The API and Worker containers MUST share the `/data` volume. If they don't, the export worker will not see jobs in the SQLite database.
- **Encoding:** Output terminal encoding on Windows may break on emojis. Run `smoke_production_deployment.py` to verify the live URL.

- `indic-transliteration` is an optional dependency; romanization fallback is conservative. Test romanized output for new language pairs.
- Export pipeline uses Playwright + FFmpeg — memory usage must stay under KVM 1 limits.
- No auth yet — API is open. Supabase Auth is planned.

## 12. How to Test Locally

```bash
# Backend
cd server
uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (separate terminal)
cd frontend
npm run dev

# Python tests
pytest tests/ -v

# Frontend lint/typecheck
cd frontend
npm run lint

---

## 13. Stage 1D — SRT/VTT/ASS Subtitle Import

**Date:** 2026-06-11 — OpenCode

### What Was Added

1. **Parser module:** `ai_pipeline/subtitle_import.py`
   - `parse_subtitle_file(content, filename, language_mode, script_mode)` → captions + import report
   - Parses SRT, VTT, and ASS subtitle files into the existing CaptionDocument-compatible format
   - Word timing estimation via `_estimate_word_timings()` for renderers that need per-word data

2. **API route:** `POST /api/subtitles/import` in `server/api/subtitles.py`
   - Accepts: uploaded file (SRT/VTT/ASS), optional languageMode, optional scriptMode
   - Returns: captions list, transcript object, import report
   - No STT provider required - works with any installed backend
   - Registered in `server/main.py` as `app.include_router(subtitles.router, prefix="/api")`

3. **Settings:** `MAX_SUBTITLE_IMPORT_BYTES` in `server/settings.py` and `.env.example`
   - Default: 2 MB (2097152 bytes)

4. **Frontend integration:**
   - `importSubtitleFile()` API function in `frontend/src/lib/api.ts`
   - "Import Subtitle File" button in the CaptionEditorPanel setup panel
   - Accepts `.srt`, `.vtt`, `.ass` files
   - On success: loads captions into editor, shows import summary
   - Existing download/export/preview works with imported captions

5. **Tests:** `tests/test_subtitle_import.py` — covers all formats, edge cases, and errors

6. **Smoke script:** `scripts/smoke_subtitle_import.py`

### Supported Formats

| Format | Extension | Status |
|--------|-----------|--------|
| SubRip | `.srt` | Full support |
| WebVTT | `.vtt` | Full support |
| Advanced SubStation Alpha | `.ass` | Text + timing only |

### ASS Support (and limitations)

- **Supported:** Text extraction, timing (Start/End), override tag stripping
- **Not supported:** Style definitions, positioning, karaoke tags, layers, fonts, colors
- ASS dialogues are parsed using the `Format:` line column mapping, so custom column orders work
- `\N` and `\n` line breaks are converted to spaces
- Override tags like `{\\an8}`, `{\\b1}`, `{\\i1}` are stripped
- Output captions are sorted by start time (ASS files may have out-of-order dialogues)

### CaptionDocument Mapping

Each imported caption produces:

```python
{
    "id": "imported_00000",           # unique ID
    "text": "Hello world",            # plain text (HTML/ASS tags stripped)
    "start": 1.0,                     # seconds
    "end": 4.0,                       # seconds
    "words": [                        # estimated word timings
        {
            "word": "hello",
            "displayedWord": "Hello",
            "originalWord": "Hello",
            "spokenWord": "Hello",
            "start": 1.0,
            "end": 2.5,
            "score": 0.0,
            "timing_source": "estimated_from_subtitle",
            "timingSource": "estimated",
            "timingNeedsReview": True,
            "timingReviewRequired": True,
        },
        ...
    ],
    "source": "subtitle_import",
    "importFormat": "srt",            # "srt" | "vtt" | "ass"
    "timingSource": "imported",
    "languageMode": "auto_mixed_indian",
    "scriptMode": "imported",
    "lang": "auto_mixed_indian",
}
```

### Word Timing Estimation

When a subtitle file has no word-level timestamps (which is the common case for SRT/VTT/ASS), words are evenly distributed across the caption duration:

```python
duration = caption_end - caption_start
step = duration / number_of_words
word_i_start = caption_start + i * step
word_i_end = caption_start + (i + 1) * step
```

- Each estimated word has `timing_source: "estimated_from_subtitle"` and `timingNeedsReview: True`
- Caption start/end are preserved and not modified by word estimation
- The existing preview/export pipeline handles estimated word timings (shows timing review warnings)

### How to Test

```bash
# Python tests
python -m pytest tests/test_subtitle_import.py -v

# Smoke test
python scripts/smoke_subtitle_import.py

# Backend server (manual test with curl)
uvicorn server.main:app --port 8000
curl -X POST -F "file=@test.srt" -F "languageMode=tenglish" http://localhost:8000/api/subtitles/import
```

### Known Limitations

1. ASS style/positioning is not preserved — only text and timing are extracted
2. SRT with embedded styling (ASS inside SRT comments) is not supported
3. VTT with nested `<c>` or `<v>` tags is partially supported (tags stripped, voice labels lost)
4. Estimated word timings are evenly spaced and not aligned to audio — timing review required
5. Karaoke (`.kax`) and other specialized subtitle formats are not supported
6. Imported captions do not create a `job` in the database — they exist only in frontend state
7. Export works with imported captions via the existing `captions_json` export flow

### Next Recommended Task (Completed in Stage 1E)

1. ~~Implement audio-only (MP3/WAV) import for caption generation~~ ✅ Stage 1E
2. Add Cloudflare R2 external storage for persisting imported files
3. Consider adding Supabase Auth for multi-user support
4. Evaluate Deepgram STT integration for non-Sarvam fallback

---

## 14. Stage 1C — Sarvam Language Mode Hardening

**Date:** 2026-06-11 — OpenCode (DeepSeek V4 Pro)

### What Changed

1. **Central STT language config:** `get_stt_language_config()` in `ai_pipeline/language_modes.py`
   - Single source of truth for provider, language_code, sarvam_mode, script_mode, display_mode
   - All 7 canonical modes have explicit config entries
   - English, Telugu, Hindi, Hinglish, Tenglish, Auto Mixed Indian, English Translation

2. **`_call_sarvam()` refactored** to use `get_stt_language_config()` instead of scattered dicts
   - Mode selection (`translit` vs `transcribe`) now from central config
   - Language code lookup from central config with backward-compat fallback
   - Logs warning for non-production-ready modes (e.g. english_translation)

3. **Timing validation helper:** `validate_transcript_timing()` in `ai_pipeline/language_modes.py`
   - Returns `{word_count, missing_timestamps, invalid_timestamps, non_monotonic_pairs, timing_quality}`
   - `timing_quality` is `"good"`, `"warning"`, or `"bad"`
   - Non-blocking: attached/logged, does not halt pipeline

4. **Timing validation wired** into `build_word_timed_transcript_from_chunks` and `normalize_aligned_segments`

5. **Canonical word schema** now includes per-word `languageMode` and `scriptMode` fields

6. **Smoke test script:** `scripts/smoke_stt_language_modes.py`
   - Prints all mode configs, legacy alias normalization, timing validation smoke
   - No API keys required

### Current Canonical Language Modes

| Internal Value | Display Label | Sarvam Mode | Script | Production Ready |
|---|---|---|---|---|
| `english` | English | transcribe | latin | Yes |
| `telugu` | Telugu | transcribe | native | Yes |
| `hindi` | Hindi | transcribe | native | Yes |
| `hinglish` | Hinglish | translit | roman | Yes |
| `tenglish` | Tenglish | translit | roman | Yes |
| `auto_mixed_indian` | Auto Indian Mixed | translit | mixed | Yes |
| `english_translation` | English Translation | translit | latin | **No** (TODO) |

### Auto Mixed Naming Decision

The codebase canonical is **`auto_mixed_indian`**. `auto_indian_mixed` is a supported alias. Changing the canonical globally would touch 50+ locations across the codebase, frontend types, and risk breaking existing DB rows. A future migration task can swap the canonical.

### Current Supported/Unsupported Modes

- **Supported and production-ready:** english, telugu, hindi, hinglish, tenglish, auto_mixed_indian
- **Supported but logged as TODO:** english_translation (routes to Sarvam translit, not true translation)
- **Not auto-selected:** Deepgram (requires `STT_DEEPGRAM_ENABLED=true`)
- **Legacy accepted:** telgish, teluglish, telugu_roman → normalize to tenglish

### Deepgram Status

Unchanged from Section 9. Deepgram is NOT auto-selected when `DEEPGRAM_API_KEY` is set. Explicit selection raises `NotImplementedError`.

### Next Recommended Task

1. Implement true English Translation pipeline (currently routes to Sarvam translit)
2. Set up Coolify deployment to Hostinger KVM 1
3. Add Cloudflare R2 for external storage
4. Consider `auto_indian_mixed` canonical migration in a separate pass

---

## 15. Stage 1E — MP3/WAV Audio-Only Import

**Date:** 2026-06-11 — OpenCode

### What Changed

1. **Backend extended to accept audio files** (`server/api/jobs.py`):
   - Added `ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg"}`
   - Added `ALLOWED_AUDIO_CONTENT_TYPES`
   - `_validate_upload_metadata()` now returns `(filename, media_kind)` tuple
   - Audio file size limit uses `MAX_AUDIO_UPLOAD_BYTES` (25 MB default)
   - Audio duration validated via FFprobe against `MAX_AUDIO_DURATION_SECONDS` (120s default)
   - `media_kind` stored in DB and returned in all API responses
   - `get_video` endpoint serves correct MIME type for audio files

2. **New audio settings** (`server/settings.py`, `.env.example`):
   - `MAX_AUDIO_UPLOAD_BYTES`, `MAX_AUDIO_DURATION_SECONDS`
   - `AUDIO_DEFAULT_WIDTH`, `AUDIO_DEFAULT_HEIGHT`, `AUDIO_DEFAULT_FPS`, `AUDIO_DEFAULT_BACKGROUND`

3. **Database migration** (`server/database.py`):
   - `media_kind` column (TEXT, default 'video') added to `jobs` table via ALTER TABLE

4. **Response models updated** (`server/models.py`, `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`):
   - `JobResponse`, `JobDetailResponse`, `UploadJobResponse`, frontend `JobResponse` all include optional `media_kind` field

5. **Frontend** (`frontend/src/lib/mediaImport.ts`, `frontend/src/components/editor/CaptionEditorPanel.tsx`):
   - `addBaseVideoIfNeeded()` now handles audio files (sets duration, adds audio clip to timeline, skips video clip)
   - `handleGenerate()` accepts `activeMedia.type === "audio"` (removed video-only guard)
   - Audio badge shown in setup panel header when active media is audio
   - Error messages updated to say "media" instead of "video"
   - Button text updated: "Import Video / Audio"
   - Help text mentions "audio" alongside video/subtitle

6. **Tests:** `tests/test_audio_import.py` — 25 tests covering:
   - Extension/content type constants
   - Audio file acceptance (MP3, WAV, M4A, OGG)
   - Video backward compatibility (MP4, MOV)
   - Rejection of unsupported extensions and mismatched content types
   - Filename sanitization for audio files

7. **Smoke script:** `scripts/smoke_audio_only_import.py`

### How Export Works for Audio-Only Projects

- Audio-only projects use the existing `captions_only` export mode in `headless_export.py`
- Synthetic 9:16 background (1080x1920, dark `#111111`)
- Original audio file is passed through with `include_audio=True`
- Frontend can select `captions_only` mode in ExportModal (already existed)

### Known Limitations

1. **Preview:** The editor canvas shows caption overlays but has no video background for audio-only projects. Audio playback uses HTMLVideoElement (which can play MP3). The preview stage is functional for caption editing but has no visual background.
2. **Duration limit:** 120 seconds hard cap for audio files. Increase via `MAX_AUDIO_DURATION_SECONDS` env var on stronger hardware.
3. **No per-word audio waveform:** Audio waveform visualization is not implemented. Caption timing is edited via the existing table/timecode interface.
4. **OGG/M4A support is optional:** Code accepts these extensions but they are not primary targets. MP3 and WAV are the required formats.

### How to Test

```bash
# Python tests
python -m pytest tests/test_audio_import.py -v

# Smoke test
python scripts/smoke_audio_only_import.py

# Full test suite
python -m pytest tests/ -v

# Manual test with actual MP3
curl -X POST -F "file=@test.mp3" -F "languageMode=english" http://localhost:8000/api/jobs
```

---

## 16. Stage 1F — Storage Abstraction (R2 & Local)

**Date:** 2026-06-11 — OpenCode

### What Changed

1. **Storage Adapter Pattern:**
   - Created `server/storage/base.py` defining `StorageAdapter` interface.
   - Created `server/storage/local.py` for backward-compatible local filesystem storage.
   - Created `server/storage/r2.py` utilizing `boto3` for Cloudflare R2 / S3-compatible remote storage.
   - Created `server/storage/__init__.py` with a `get_storage()` factory that switches based on `STORAGE_BACKEND`.

2. **Database Schema Additions:**
   - Added `storage_backend`, `object_key`, and `expires_at` to the `jobs` and `export_jobs` tables via safe `ALTER TABLE` migrations.
   - Updated `server/api/jobs.py` and `server/api/export_jobs.py` to persist these fields on creation.

### Stage 1G (Auth & Usage)
* Added `server/auth.py` and `server/usage.py`
* Integrated Supabase PKCE login flow on frontend.
* Protected `POST /api/jobs` and `POST /api/export` with JWT validation (falling back to anonymous quota).

### Stage 1H (Razorpay Billing)
* Added `subscriptions` and `billing_events` tables.
* Implemented `server/billing.py` and `server/api/billing.py`.
* Integrated webhook signature validation.
* Updated `Toolbar.tsx` with upgrade UI fetching from `/api/billing/me`.
* Tested idempotency with `scripts/smoke_billing_razorpay.py`.

### Architectural Decisions Log
1. **Local vs Cloud Processing:** We strictly use local FFmpeg/FFprobe and keep models API-based.
2. **Quota Tracking:** `server/usage.py` controls limits based on `server/auth.py`'s UserContext. Free accounts get limits. Unauthenticated get `X-Anonymous-Session` quotas.
3. **Database:** SQLite via `aiosqlite`. We append schema migrations via `ALTER TABLE` catch-blocks to prevent wipes.

3. **Uploads & Exports Flow Updated:**
   - `server/api/jobs.py` now uploads source media to `get_storage().save_file()` immediately after local disk persistence.
   - `server/api/export_jobs.py` now uploads the final MP4 to `get_storage().save_file()` synchronously using `run_in_threadpool`.
   - `get_video` in `server/api/jobs.py` and `download_export_file` in `server/api/export_jobs.py` now check local storage first, then fallback to `StorageAdapter.get_url()` which returns a redirect (e.g., presigned R2 URL).

4. **Cleanup Script for 24-hour Expiry:**
   - Created `scripts/cleanup_expired_storage.py` which queries `jobs` and `export_jobs` for `expires_at < current_time()`, deletes files from their respective backends (Local or R2), and removes the records from the database.
   - Settings `FREE_UPLOAD_TTL_HOURS` and `FREE_EXPORT_TTL_HOURS` added to `.env.example` (default 24h).

5. **Tests & Smoke Scripts:**
   - Added `boto3` to `requirements.txt`.
   - Created `scripts/smoke_storage_adapter.py` for quick end-to-end verification.

### How to Test

```bash
# Smoke test storage backend
python scripts/smoke_storage_adapter.py

# Run cleanup manually
python scripts/cleanup_expired_storage.py
```

### Next Recommended Task

1. Implement user authentication (Supabase).
2. Wire up Hostinger KVM 1 deployment pipeline (Coolify).

```