"""Băm mật khẩu (Argon2id) và cấp/kiểm JWT.

Không dùng bcrypt/MD5/plaintext — xem A.4 về hiện trạng app cũ.
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from khuphoso.core.config import get_settings

settings = get_settings()

# Tham số Argon2id — cân bằng giữa an toàn và độ trễ đăng nhập trên máy chủ dùng chung
_ph = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=4, hash_len=32, salt_len=16)

ALGO = "HS256"
ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=30)


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, hashed: str) -> tuple[bool, str | None]:
    """Trả về (đúng/sai, hash mới nếu cần nâng tham số)."""
    try:
        _ph.verify(hashed, password)
    except (VerifyMismatchError, InvalidHashError, ValueError):
        return False, None
    if _ph.check_needs_rehash(hashed):
        return True, _ph.hash(password)
    return True, None


def create_access_token(
    *,
    user_id: str,
    slug: str | None,
    role: str | None,
    permissions: list[str],
    ho_tro: bool = False,
    full_name: str = "",
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": user_id,
        "kp": slug,
        "name": full_name,
        "role": role,
        "perms": permissions,
        "ht": ho_tro,
        "iat": int(now.timestamp()),
        "exp": int((now + ACCESS_TTL).timestamp()),
        "typ": "access",
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGO)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.secret_key, algorithms=[ALGO])


def new_refresh_token() -> tuple[str, str, datetime]:
    """Sinh refresh token. Trả về (token thô, hash để lưu DB, hạn dùng).

    DB chỉ lưu hash — lộ database cũng không mạo danh được phiên.
    """
    raw = secrets.token_urlsafe(48)
    digest = hashlib.sha256(raw.encode()).hexdigest()
    return raw, digest, datetime.now(UTC) + REFRESH_TTL


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
