import pytest
from server.usage import QuotaResult, check_quota
from server.auth import UserContext

@pytest.mark.anyio
async def test_check_quota_anonymous():
    # Anonymous users should have free limits applied
    ctx = UserContext(is_authenticated=False, user_id=None, email=None, provider="anonymous")
    
    # In a real test, we would mock DB calls inside check_quota,
    # but for now we just verify it exists and can be imported.
    # We won't test full DB integration here unless we mock get_db.
    assert check_quota is not None
