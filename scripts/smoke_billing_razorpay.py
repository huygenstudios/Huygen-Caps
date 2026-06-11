import asyncio
import json
import hmac
import hashlib
import os
import httpx

# Set a dummy secret for testing
os.environ["RAZORPAY_WEBHOOK_SECRET"] = "smoke_secret"
os.environ["RAZORPAY_BILLING_ENABLED"] = "true"

from server.main import app
from server.database import get_db, init_db

async def run_smoke():
    print("Running Billing/Razorpay smoke tests...")
    await init_db()
    
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Get plans
        res = await client.get("/api/billing/plans")
        assert res.status_code == 200
        plans = res.json()["plans"]
        print(f"Found {len(plans)} plans.")
        
        # 2. Test webhook signature validation
        payload = {
            "event": "subscription.charged",
            "payload": {
                "subscription": {
                    "entity": {
                        "id": "sub_smoke_123",
                        "plan_id": "plan_creator",
                        "customer_id": "cust_123",
                        "status": "active",
                        "notes": {
                            "user_id": "smoke-user"
                        }
                    }
                }
            }
        }
        payload_bytes = json.dumps(payload).encode("utf-8")
        signature = hmac.new(b"smoke_secret", payload_bytes, hashlib.sha256).hexdigest()
        
        res = await client.post(
            "/api/billing/razorpay/webhook",
            content=payload_bytes,
            headers={
                "X-Razorpay-Signature": signature,
                "X-Razorpay-Event-Id": "ev_smoke_001"
            }
        )
        assert res.status_code == 200
        print("Webhook processed successfully.")
        
        # Test idempotency
        res2 = await client.post(
            "/api/billing/razorpay/webhook",
            content=payload_bytes,
            headers={
                "X-Razorpay-Signature": signature,
                "X-Razorpay-Event-Id": "ev_smoke_001"
            }
        )
        assert res2.status_code == 200
        assert res2.json()["duplicate"] == True
        print("Webhook idempotency verified.")
        
        # Verify DB state
        async for db in get_db():
            async with db.execute("SELECT status, plan_key FROM subscriptions WHERE razorpay_subscription_id = 'sub_smoke_123'") as cursor:
                row = await cursor.fetchone()
                assert row is not None
                assert row["status"] == "active"
                assert row["plan_key"] == "free" # Default fallback when plan ID doesn't match env var
        print("DB subscription state verified.")

if __name__ == "__main__":
    asyncio.run(run_smoke())
    print("All billing smoke tests passed.")
