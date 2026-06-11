import uuid
from typing import Optional
from dataclasses import dataclass
from fastapi import HTTPException

from .database import get_db
from .auth import UserContext
from .settings import ANONYMOUS_PREVIEW_ENABLED

@dataclass
class QuotaResult:
    allowed: bool
    reason: str
    remaining_minutes: Optional[float] = None
    remaining_exports: Optional[int] = None
    plan_key: str = "free"

async def record_usage_event(
    user_context: UserContext,
    event_type: str,
    media_duration_sec: float = 0.0,
    provider: str = "unknown",
    storage_backend: str = "local",
    job_id: Optional[str] = None,
    export_job_id: Optional[str] = None,
    cost_estimate: float = 0.0,
    anonymous_session_id: Optional[str] = None
) -> str:
    event_id = str(uuid.uuid4())
    
    if not user_context.is_authenticated and not anonymous_session_id:
        anonymous_session_id = "anon_" + str(uuid.uuid4())[:8]
        
    async for db in get_db():
        await db.execute('''
            INSERT INTO usage_events (
                id, user_id, anonymous_session_id, event_type, media_duration_sec,
                provider, storage_backend, job_id, export_job_id, cost_estimate
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            event_id,
            user_context.user_id if user_context.is_authenticated else None,
            anonymous_session_id if not user_context.is_authenticated else None,
            event_type,
            media_duration_sec,
            provider,
            storage_backend,
            job_id,
            export_job_id,
            cost_estimate
        ))
        await db.commit()
        return event_id
    
    raise RuntimeError("Could not connect to database")


async def get_usage_summary(user_context: UserContext, anonymous_session_id: Optional[str] = None) -> dict:
    if not user_context.is_authenticated and not ANONYMOUS_PREVIEW_ENABLED:
        return {
            "authenticated": False,
            "error": "Anonymous usage disabled."
        }
        
    plan_key = "free"
    generation_minutes_limit = 30
    exports_per_day = 3
    
    async for db in get_db():
        if user_context.is_authenticated:
            # Check for an active subscription first
            async with db.execute("SELECT plan_key FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1", (user_context.user_id,)) as cursor:
                row = await cursor.fetchone()
                if row:
                    plan_key = row["plan_key"]
                else:
                    # Fallback to user_profiles
                    async with db.execute("SELECT plan_key FROM user_profiles WHERE supabase_user_id = ?", (user_context.user_id,)) as cursor:
                        row = await cursor.fetchone()
                        if row:
                            plan_key = row["plan_key"]
                    
            async with db.execute("SELECT generation_minutes_monthly, exports_per_day FROM plan_entitlements WHERE plan_key = ?", (plan_key,)) as cursor:
                row = await cursor.fetchone()
                if row:
                    generation_minutes_limit = row["generation_minutes_monthly"]
                    exports_per_day = row["exports_per_day"]
                    
            async with db.execute("SELECT SUM(media_duration_sec) as total_sec FROM usage_events WHERE user_id = ? AND event_type = 'generation'", (user_context.user_id,)) as cursor:
                row = await cursor.fetchone()
                used_sec = row["total_sec"] if row and row["total_sec"] is not None else 0
                used_minutes = used_sec / 60
                
            async with db.execute("SELECT COUNT(*) as exp_count FROM usage_events WHERE user_id = ? AND event_type = 'export' AND date(created_at) = date('now')", (user_context.user_id,)) as cursor:
                row = await cursor.fetchone()
                used_exports = row["exp_count"] if row else 0
                
        else:
            used_minutes = 0
            used_exports = 0
            if anonymous_session_id:
                async with db.execute("SELECT SUM(media_duration_sec) as total_sec FROM usage_events WHERE anonymous_session_id = ? AND event_type = 'generation'", (anonymous_session_id,)) as cursor:
                    row = await cursor.fetchone()
                    used_sec = row["total_sec"] if row and row["total_sec"] is not None else 0
                    used_minutes = used_sec / 60
                async with db.execute("SELECT COUNT(*) as exp_count FROM usage_events WHERE anonymous_session_id = ? AND event_type = 'export' AND date(created_at) = date('now')", (anonymous_session_id,)) as cursor:
                    row = await cursor.fetchone()
                    used_exports = row["exp_count"] if row else 0
            
        return {
            "authenticated": user_context.is_authenticated,
            "user_id": user_context.user_id,
            "plan_key": plan_key,
            "generation_minutes_used": round(used_minutes, 2),
            "generation_minutes_limit": generation_minutes_limit,
            "remaining_minutes": max(0, generation_minutes_limit - used_minutes),
            "exports_today": used_exports,
            "exports_per_day": exports_per_day,
            "remaining_exports": max(0, exports_per_day - used_exports),
            "auth_required_flags": {
                "anonymous_preview_enabled": ANONYMOUS_PREVIEW_ENABLED
            }
        }
        
    return {}


async def check_quota(user_context: UserContext, event_type: str, media_duration_sec: float = 0.0, anonymous_session_id: Optional[str] = None) -> QuotaResult:
    if not user_context.is_authenticated and not ANONYMOUS_PREVIEW_ENABLED:
        return QuotaResult(allowed=False, reason="Anonymous usage is disabled. Please sign in.")
        
    summary = await get_usage_summary(user_context, anonymous_session_id)
    if not summary or "error" in summary:
        return QuotaResult(allowed=False, reason=summary.get("error", "Quota check unavailable."))
        
    if event_type == "generation":
        req_minutes = media_duration_sec / 60.0
        if summary.get("remaining_minutes", 0) < req_minutes:
            return QuotaResult(
                allowed=False, 
                reason=f"Insufficient generation minutes. Need {req_minutes:.1f}m, have {summary['remaining_minutes']:.1f}m left.",
                remaining_minutes=summary.get("remaining_minutes"),
                remaining_exports=summary.get("remaining_exports"),
                plan_key=summary.get("plan_key", "free")
            )
            
    elif event_type == "export":
        if summary.get("remaining_exports", 0) < 1:
            return QuotaResult(
                allowed=False,
                reason="Daily export limit reached.",
                remaining_minutes=summary.get("remaining_minutes"),
                remaining_exports=summary.get("remaining_exports"),
                plan_key=summary.get("plan_key", "free")
            )
            
    return QuotaResult(
        allowed=True,
        reason="Quota check passed.",
        remaining_minutes=summary.get("remaining_minutes"),
        remaining_exports=summary.get("remaining_exports"),
        plan_key=summary.get("plan_key", "free")
    )
