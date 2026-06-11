from fastapi import APIRouter, Depends, Request
from ..auth import get_current_user_optional, require_current_user, UserContext
from ..usage import get_usage_summary

router = APIRouter(prefix="/user", tags=["user"])

@router.get("/me")
async def get_me(user_context: UserContext = Depends(get_current_user_optional)):
    """Returns the current authenticated user context, or anonymous state."""
    return user_context

@router.get("/usage")
async def get_my_usage(
    request: Request,
    user_context: UserContext = Depends(get_current_user_optional)
):
    """Returns the usage summary and quotas for the current user or anonymous session."""
    # Try to extract an anonymous session ID if the user isn't authenticated
    # Usually the frontend will send it in a header like X-Anonymous-Session
    anon_id = request.headers.get("X-Anonymous-Session")
    return await get_usage_summary(user_context, anonymous_session_id=anon_id)
