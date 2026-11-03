from uuid import UUID, uuid4

from app.domain.session_tokens import issue_session_token, parse_session_token

SECRET = "test-session-secret"
SID = UUID("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")


def test_round_trip() -> None:
    assert parse_session_token(SECRET, issue_session_token(SECRET, SID)) == SID


def test_missing_or_malformed() -> None:
    for token in (None, "", "no-dot", "a.b.c", "not-a-uuid.abc", f"{SID}."):
        assert parse_session_token(SECRET, token) is None


def test_wrong_secret() -> None:
    assert parse_session_token("other-secret", issue_session_token(SECRET, SID)) is None


def test_mac_bound_to_session_id() -> None:
    _, mac = issue_session_token(SECRET, SID).split(".")
    assert parse_session_token(SECRET, f"{uuid4()}.{mac}") is None


def test_non_canonical_uuid_rejected() -> None:
    _, mac = issue_session_token(SECRET, SID).split(".")
    assert parse_session_token(SECRET, f"{str(SID).upper()}.{mac}") is None
    assert parse_session_token(SECRET, f"{SID.hex}.{mac}") is None


def test_non_ascii_rejected() -> None:
    assert parse_session_token(SECRET, f"{SID}.ünïcödé") is None
