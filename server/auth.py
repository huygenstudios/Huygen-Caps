from dataclasses import dataclass
from typing import Optional, Any
from fastapi import Request, HTTPException, status
import jwt
from httpx import AsyncClient

from .settings import SUPABASE_JWT_SECRET, SUPABASE_URL

@dataclass
class UserContext:
    is_authenticated: bool
    user_id: Optional[str]
    email: Optional[str]
    provider: str  # 'supabase', 'anonymous', 'mock'
    raw_claims: Optional[dict[str, Any]] = None


async def verify_supabase_jwt(token: str) -> UserContext:
    # If a secret is provided, decode locally
    if SUPABASE_JWT_SECRET:
        try:
            payload = jwt.decode(
                token, 
                SUPABASE_JWT_SECRET, 
                algorithms=["HS256"], 
                options={"verify_aud": False}
            )
            return UserContext(
                is_authenticated=True,
                user_id=payload.get("sub"),
                email=payload.get("email"),
                provider="supabase",
                raw_claims=payload
            )
        except jwt.PyJWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token: {str(e)}"
            )
            
    # If no secret, try validating against Supabase API
    if SUPABASE_URL:
        try:
            async with AsyncClient() as client:
                res = await client.get(
                    f"{SUPABASE_URL.rstrip('/')}/auth/v1/user",
                    headers={"Authorization": f"Bearer {token}"}
                )
            if res.status_code == 200:
                data = res.json()
                return UserContext(
                    is_authenticated=True,
                    user_id=data.get("id"),
                    email=data.get("email"),
                    provider="supabase",
                    raw_claims=data
                )
        except Exception:
            pass
            
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token or unable to reach auth provider."
        )
        
    # If neither is configured, we might be in local dev mock mode.
    # We do NOT trust random JWTs in production without secret or URL.
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Auth is required but not configured on the backend."
    )


async def get_current_user_optional(request: Request) -> UserContext:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        # Allow mocked auth for scripts without requiring env vars or real JWTs
        if auth_header and auth_header.startswith("Mock "):
            mock_id = auth_header.split(" ")[1]
            return UserContext(
                is_authenticated=True,
                user_id=mock_id,
                email=f"{mock_id}@example.com",
                provider="mock"
            )
        return UserContext(
            is_authenticated=False,
            user_id=None,
            email=None,
            provider="anonymous"
        )
        
    token = auth_header[7:]
    return await verify_supabase_jwt(token)


async def require_current_user(request: Request) -> UserContext:
    user = await get_current_user_optional(request)
    if not user.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required."
        )
    return user
