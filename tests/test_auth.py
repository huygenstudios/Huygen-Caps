import pytest
import os
import jwt
import time
from server.auth import verify_supabase_jwt, UserContext

@pytest.mark.anyio
async def test_verify_supabase_jwt_valid(monkeypatch):
    secret = "test-secret-that-is-at-least-32-bytes-long-for-hmac-sha256"
    monkeypatch.setattr("server.auth.SUPABASE_JWT_SECRET", secret)

    payload = {
        "sub": "test-user-123",
        "email": "test@example.com",
        "exp": int(time.time()) + 3600,
        "aud": "authenticated"
    }
    token = jwt.encode(payload, secret, algorithm="HS256")
    
    ctx = await verify_supabase_jwt(token)
    assert ctx is not None
    assert ctx.is_authenticated is True
    assert ctx.user_id == "test-user-123"
    assert ctx.email == "test@example.com"

@pytest.mark.anyio
async def test_verify_supabase_jwt_invalid(monkeypatch):
    secret = "test-secret-that-is-at-least-32-bytes-long-for-hmac-sha256"
    monkeypatch.setattr("server.auth.SUPABASE_JWT_SECRET", secret)
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        await verify_supabase_jwt("invalid.token.here")
