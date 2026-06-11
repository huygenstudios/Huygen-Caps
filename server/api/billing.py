from fastapi import APIRouter, Request, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from ..auth import require_current_user, get_current_user_optional
from ..database import get_db
from ..settings import (
    RAZORPAY_BILLING_ENABLED,
    RAZORPAY_CHECKOUT_PUBLIC_KEY_ID,
    RAZORPAY_WEBHOOK_SECRET
)
from ..billing import (
    create_razorpay_subscription,
    get_subscription_for_user,
    verify_razorpay_webhook_signature,
    process_razorpay_webhook_event
)

router = APIRouter(prefix="/billing", tags=["billing"])

class CheckoutRequest(BaseModel):
    plan_key: str

@router.get("/plans")
async def get_plans(request: Request):
    """Returns available plans and whether billing is enabled."""
    user = await get_current_user_optional(request)
    
    plans = []
    async for db in get_db():
        async with db.execute("SELECT * FROM plan_entitlements") as cursor:
            async for row in cursor:
                plans.append(dict(row))
                
    # Sort plans: free first, then creator, then pro (crude sort)
    order = {"free": 0, "creator": 1, "pro": 2}
    plans.sort(key=lambda x: order.get(x["plan_key"], 99))
    
    current_plan = "free"
    if user.is_authenticated:
        sub = await get_subscription_for_user(user.user_id)
        if sub and sub["status"] == "active":
            current_plan = sub["plan_key"]
        else:
            # Fallback to user_profile plan
            async for db in get_db():
                async with db.execute("SELECT plan_key FROM user_profiles WHERE supabase_user_id = ?", (user.user_id,)) as cursor:
                    row = await cursor.fetchone()
                    if row:
                        current_plan = row["plan_key"]

    return {
        "billing_enabled": RAZORPAY_BILLING_ENABLED,
        "current_plan": current_plan,
        "plans": plans
    }

@router.get("/me")
async def get_billing_me(request: Request):
    """Returns the current user's billing state."""
    user = await get_current_user_optional(request)
    if not user.is_authenticated:
        return {
            "authenticated": False,
            "billing_enabled": RAZORPAY_BILLING_ENABLED
        }
        
    current_plan = "free"
    subscription_status = "inactive"
    current_period_end = None
    
    sub = await get_subscription_for_user(user.user_id)
    if sub:
        subscription_status = sub["status"]
        current_period_end = sub["current_period_end"]
        if subscription_status == "active":
            current_plan = sub["plan_key"]
            
    if current_plan == "free":
        async for db in get_db():
            async with db.execute("SELECT plan_key FROM user_profiles WHERE supabase_user_id = ?", (user.user_id,)) as cursor:
                row = await cursor.fetchone()
                if row:
                    current_plan = row["plan_key"]
                    
    entitlements = None
    async for db in get_db():
        async with db.execute("SELECT * FROM plan_entitlements WHERE plan_key = ?", (current_plan,)) as cursor:
            row = await cursor.fetchone()
            if row:
                entitlements = dict(row)

    return {
        "authenticated": True,
        "billing_enabled": RAZORPAY_BILLING_ENABLED,
        "current_plan": current_plan,
        "subscription_status": subscription_status,
        "current_period_end": current_period_end,
        "entitlements": entitlements
    }

@router.post("/checkout")
async def checkout(request: Request, body: CheckoutRequest):
    """Creates a Razorpay subscription and returns checkout info."""
    user = await require_current_user(request)
    
    if not RAZORPAY_BILLING_ENABLED:
        raise HTTPException(status_code=503, detail="Billing is disabled.")
        
    sub_data = await create_razorpay_subscription(user, body.plan_key)
    
    return {
        "razorpay_subscription_id": sub_data["id"],
        "short_url": sub_data.get("short_url"),
        "razorpay_key_id": RAZORPAY_CHECKOUT_PUBLIC_KEY_ID,
        "plan_key": body.plan_key
    }

@router.post("/razorpay/webhook")
async def razorpay_webhook(request: Request):
    """Processes Razorpay webhooks."""
    signature = request.headers.get("X-Razorpay-Signature")
    event_id = request.headers.get("X-Razorpay-Event-Id")
    
    if not signature or not event_id:
        raise HTTPException(status_code=400, detail="Missing required headers.")
        
    raw_body = await request.body()
    
    if not verify_razorpay_webhook_signature(raw_body, signature, RAZORPAY_WEBHOOK_SECRET):
        raise HTTPException(status_code=401, detail="Invalid signature.")
        
    import json
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")
        
    event_type = payload.get("event", "unknown")
    
    # Process event
    is_new = await process_razorpay_webhook_event(event_id, event_type, payload)
    
    # Razorpay expects a 200 OK
    return {"status": "ok", "duplicate": not is_new}
