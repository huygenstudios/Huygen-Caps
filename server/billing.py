import json
import uuid
import hmac
import hashlib
from datetime import datetime
from typing import Optional, Any
from fastapi import HTTPException
import httpx

from .database import get_db
from .auth import UserContext
from .settings import (
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET,
    RAZORPAY_PLAN_FREE,
    RAZORPAY_PLAN_CREATOR_ID,
    RAZORPAY_PLAN_PRO_ID,
    RAZORPAY_BILLING_ENABLED
)

def map_razorpay_status_to_plan_status(status: str) -> str:
    """Maps razorpay subscription status to local active/inactive status."""
    status = status.lower()
    # Active states
    if status in ["active", "authenticated", "charged", "resumed"]:
        return "active"
    # Inactive states
    if status in ["cancelled", "completed", "expired", "halted"]:
        return "inactive"
    # Pending/other states
    if status in ["created", "pending"]:
        return "pending"
    return "inactive"


def verify_razorpay_webhook_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    if not secret or not signature:
        return False
    expected_mac = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected_mac, signature)


async def get_subscription_for_user(user_id: str) -> Optional[dict]:
    async for db in get_db():
        async with db.execute(
            "SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", 
            (user_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return dict(row)
    return None


async def process_razorpay_webhook_event(event_id: str, event_type: str, payload: dict) -> bool:
    """Processes the webhook, storing the event and updating the subscription if relevant. Returns True if successfully processed, False if duplicate."""
    
    # Store event idempotently
    async for db in get_db():
        try:
            await db.execute('''
                INSERT INTO billing_events 
                (id, razorpay_event_id, event_type, payload_json, processed_at)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                str(uuid.uuid4()),
                event_id,
                event_type,
                json.dumps(payload),
                datetime.utcnow().isoformat()
            ))
            await db.commit()
        except Exception as e:
            if "UNIQUE constraint failed" in str(e):
                return False # Duplicate event
            raise e
            
        # Parse payload for subscription updates
        if "subscription" in payload.get("payload", {}):
            sub = payload["payload"]["subscription"]["entity"]
            sub_id = sub.get("id")
            rzp_plan_id = sub.get("plan_id")
            customer_id = sub.get("customer_id")
            raw_status = sub.get("status", "")
            status = map_razorpay_status_to_plan_status(raw_status)
            
            # Map plan
            plan_key = RAZORPAY_PLAN_FREE
            if rzp_plan_id == RAZORPAY_PLAN_CREATOR_ID:
                plan_key = "creator"
            elif rzp_plan_id == RAZORPAY_PLAN_PRO_ID:
                plan_key = "pro"
                
            current_period_start = datetime.fromtimestamp(sub.get("current_start", 0)).isoformat() if sub.get("current_start") else None
            current_period_end = datetime.fromtimestamp(sub.get("current_end", 0)).isoformat() if sub.get("current_end") else None
            
            # Notes usually contain internal user_id
            user_id = sub.get("notes", {}).get("user_id")
            
            # We must either upsert by subscription ID or insert a new one
            async with db.execute("SELECT id FROM subscriptions WHERE razorpay_subscription_id = ?", (sub_id,)) as cursor:
                existing = await cursor.fetchone()
                
            if existing:
                await db.execute('''
                    UPDATE subscriptions SET 
                        status = ?,
                        plan_key = ?,
                        current_period_start = ?,
                        current_period_end = ?,
                        raw_status = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE razorpay_subscription_id = ?
                ''', (status, plan_key, current_period_start, current_period_end, raw_status, sub_id))
            else:
                # Need user_id to map it locally
                if not user_id:
                    # In a real app we'd need to fallback or fetch customer details
                    pass
                else:
                    await db.execute('''
                        INSERT INTO subscriptions (
                            id, user_id, plan_key, status, razorpay_customer_id, 
                            razorpay_subscription_id, razorpay_plan_id, current_period_start, 
                            current_period_end, raw_status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        str(uuid.uuid4()), user_id, plan_key, status, customer_id,
                        sub_id, rzp_plan_id, current_period_start, current_period_end, raw_status
                    ))
                    
            await db.commit()
            
    return True


async def create_razorpay_subscription(user_context: UserContext, plan_key: str) -> dict:
    if not RAZORPAY_BILLING_ENABLED:
        raise HTTPException(status_code=503, detail="Billing is disabled.")
        
    if not user_context.is_authenticated or not user_context.user_id:
        raise HTTPException(status_code=401, detail="Must be logged in to subscribe.")
        
    if plan_key == "free":
        raise HTTPException(status_code=400, detail="Cannot subscribe to free plan via Razorpay.")
        
    rzp_plan_id = RAZORPAY_PLAN_CREATOR_ID if plan_key == "creator" else RAZORPAY_PLAN_PRO_ID if plan_key == "pro" else None
    
    if not rzp_plan_id:
        raise HTTPException(status_code=400, detail="Invalid plan key.")
        
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=503, detail="Billing configuration is incomplete.")
        
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.razorpay.com/v1/subscriptions",
            auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
            json={
                "plan_id": rzp_plan_id,
                "total_count": 12, # E.g., 12 months. Razorpay requires total_count for standard subs.
                "customer_notify": 1,
                "notes": {
                    "user_id": user_context.user_id
                }
            }
        )
        
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=f"Razorpay error: {response.text}")
            
        data = response.json()
        
        # Razorpay creates subscriptions in "created" state.
        # We can store a pending record.
        async for db in get_db():
            await db.execute('''
                INSERT INTO subscriptions (
                    id, user_id, plan_key, status, razorpay_subscription_id, razorpay_plan_id, raw_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                str(uuid.uuid4()), user_context.user_id, plan_key, "pending", data["id"], rzp_plan_id, data["status"]
            ))
            await db.commit()
            
        return data
