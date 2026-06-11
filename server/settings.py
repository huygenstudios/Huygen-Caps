import os
import shutil
import tempfile
import time
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]


def _default_temp_dir() -> Path:
    if os.name == "nt":
        return Path(tempfile.gettempdir()) / "huygen-caps"
    return Path("/tmp/huygen-caps")


DEFAULT_TEMP_DIR = _default_temp_dir()


def _path_env(name: str, default: Path) -> Path:
    value = os.getenv(name, "").strip()
    return Path(value).expanduser() if value else default


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("true", "1", "yes", "y", "on")


TEMP_DIR = _path_env("TEMP_DIR", DEFAULT_TEMP_DIR)
UPLOAD_DIR = _path_env("UPLOAD_DIR", TEMP_DIR / "uploads")
EXPORT_DIR = _path_env("EXPORT_DIR", TEMP_DIR / "exports")
CACHE_DIR = _path_env("CACHE_DIR", TEMP_DIR / "cache")
DB_PATH = _path_env("DB_PATH", TEMP_DIR / "database.sqlite")
FRONTEND_DIST_DIR = _path_env("FRONTEND_DIST_DIR", ROOT_DIR / "frontend" / "out")

MAX_UPLOAD_SIZE_MB = _int_env("MAX_UPLOAD_SIZE_MB", 500)
RUNTIME_CLEANUP_HOURS = _int_env("RUNTIME_CLEANUP_HOURS", 24)
MAX_CONCURRENT_EXPORTS = max(1, _int_env("EXPORT_CONCURRENCY", _int_env("MAX_CONCURRENT_EXPORTS", 1)))
MAX_EXPORT_DURATION_SECONDS = max(1, _int_env("MAX_EXPORT_DURATION_SECONDS", 300))
MAX_SUBTITLE_IMPORT_BYTES = _int_env("MAX_SUBTITLE_IMPORT_BYTES", 2 * 1024 * 1024)

FREE_EXPORT_TTL_HOURS = _int_env("FREE_EXPORT_TTL_HOURS", 24)
FREE_UPLOAD_TTL_HOURS = _int_env("FREE_UPLOAD_TTL_HOURS", 24)


MAX_AUDIO_UPLOAD_BYTES = _int_env("MAX_AUDIO_UPLOAD_BYTES", 25 * 1024 * 1024)
MAX_AUDIO_DURATION_SECONDS = max(1, _int_env("MAX_AUDIO_DURATION_SECONDS", 120))
AUDIO_DEFAULT_WIDTH = _int_env("AUDIO_DEFAULT_WIDTH", 1080)
AUDIO_DEFAULT_HEIGHT = _int_env("AUDIO_DEFAULT_HEIGHT", 1920)
AUDIO_DEFAULT_FPS = max(1, min(30, _int_env("AUDIO_DEFAULT_FPS", 30)))
AUDIO_DEFAULT_BACKGROUND = os.getenv("AUDIO_DEFAULT_BACKGROUND", "#111111")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "").strip()
AUTH_REQUIRED_FOR_EXPORT = _bool_env("AUTH_REQUIRED_FOR_EXPORT", False)
AUTH_REQUIRED_FOR_SAVE = _bool_env("AUTH_REQUIRED_FOR_SAVE", True)
ANONYMOUS_PREVIEW_ENABLED = _bool_env("ANONYMOUS_PREVIEW_ENABLED", True)
FREE_PLAN_GENERATION_MINUTES = _int_env("FREE_PLAN_GENERATION_MINUTES", 30)
FREE_PLAN_EXPORTS_PER_DAY = _int_env("FREE_PLAN_EXPORTS_PER_DAY", 3)

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()
RAZORPAY_CURRENCY = os.getenv("RAZORPAY_CURRENCY", "INR").strip()
RAZORPAY_PLAN_FREE = os.getenv("RAZORPAY_PLAN_FREE", "free").strip()
RAZORPAY_PLAN_CREATOR_ID = os.getenv("RAZORPAY_PLAN_CREATOR_ID", "").strip()
RAZORPAY_PLAN_PRO_ID = os.getenv("RAZORPAY_PLAN_PRO_ID", "").strip()
RAZORPAY_CHECKOUT_PUBLIC_KEY_ID = os.getenv("RAZORPAY_CHECKOUT_PUBLIC_KEY_ID", RAZORPAY_KEY_ID).strip()
RAZORPAY_BILLING_ENABLED = _bool_env("RAZORPAY_BILLING_ENABLED", False)
BILLING_SUCCESS_URL = os.getenv("BILLING_SUCCESS_URL", "/login?success=true").strip()
BILLING_CANCEL_URL = os.getenv("BILLING_CANCEL_URL", "/login?canceled=true").strip()


def env_list(name: str, fallback: list[str]) -> list[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return fallback
    return [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]


def ensure_runtime_dirs() -> None:
    for path in (TEMP_DIR, UPLOAD_DIR, EXPORT_DIR, CACHE_DIR, DB_PATH.parent):
        path.mkdir(parents=True, exist_ok=True)


def cleanup_old_runtime_files(max_age_hours: int | None = None) -> int:
    """Best-effort cleanup for Render's ephemeral disk and local temp files."""
    max_age = (max_age_hours if max_age_hours is not None else RUNTIME_CLEANUP_HOURS) * 3600
    if max_age <= 0:
        return 0

    cutoff = time.time() - max_age
    removed = 0
    for directory in (UPLOAD_DIR, EXPORT_DIR):
        if not directory.exists():
            continue
        for path in directory.iterdir():
            try:
                if path.stat().st_mtime >= cutoff:
                    continue
                if path.is_file():
                    path.unlink()
                    removed += 1
                elif path.is_dir():
                    shutil.rmtree(path)
                    removed += 1
            except OSError:
                continue
    return removed


def frontend_dist_available() -> bool:
    return (FRONTEND_DIST_DIR / "index.html").exists()


def bundled_render_page_url() -> str:
    port = os.getenv("PORT", "8000")
    return f"http://127.0.0.1:{port}/render.html"


def default_render_page_url() -> str:
    configured = os.getenv("RENDER_PAGE_URL", "").strip()
    if configured:
        return configured

    if frontend_dist_available() or os.getenv("NODE_ENV") == "production":
        return bundled_render_page_url()

    return "http://localhost:3000/render"


def dependency_status() -> dict[str, bool | str]:
    return {
        "ffmpeg": bool(shutil.which("ffmpeg")),
        "ffprobe": bool(shutil.which("ffprobe")),
        "storage": str(TEMP_DIR),
        "uploads": str(UPLOAD_DIR),
        "exports": str(EXPORT_DIR),
        "frontend_static": frontend_dist_available(),
    }
