from fastapi.testclient import TestClient

from app.db import DbPing, get_db_ping
from app.main import create_app


def _client_with_ping(result: bool) -> TestClient:
    app = create_app()

    async def ping() -> bool:
        return result

    def override() -> DbPing:
        return ping

    app.dependency_overrides[get_db_ping] = override
    # No `with` block: the lifespan (real DB pool) is not started in unit tests.
    return TestClient(app)


def test_health_ok_when_db_reachable() -> None:
    res = _client_with_ping(True).get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "db": "ok"}


def test_health_503_when_db_down() -> None:
    res = _client_with_ping(False).get("/health")
    assert res.status_code == 503
    assert res.json() == {"status": "degraded", "db": "down"}
