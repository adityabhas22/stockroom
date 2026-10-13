import os
import secrets

from fastapi import HTTPException, Request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer


def serializer():
    key = os.environ.get("SESSION_SECRET", "")
    if len(key) < 32:
        raise RuntimeError("SESSION_SECRET must contain at least 32 characters")
    return URLSafeTimedSerializer(key, salt="stockroom-session-v1")


def verify_password(password: str):
    expected = os.environ.get("OPERATOR_PASSWORD", "")
    return bool(expected) and secrets.compare_digest(password.encode(), expected.encode())


def require_session(request: Request):
    try:
        payload = serializer().loads(request.cookies.get("session", ""), max_age=28800)
        if payload != {"role": "operator"}:
            raise BadSignature("Unexpected session")
    except (BadSignature, SignatureExpired):
        raise HTTPException(401, "Sign in to continue") from None


def require_csrf(request: Request):
    # A cross-origin HTML form cannot set this header. No CORS origins are enabled.
    if (
        request.method not in {"GET", "HEAD", "OPTIONS"}
        and request.headers.get("X-Stockroom-Request") != "1"
    ):
        raise HTTPException(403, "Missing request header")
