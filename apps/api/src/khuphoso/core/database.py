"""Tầng kết nối — MỖI KHU PHỐ MỘT CƠ SỞ DỮ LIỆU RIÊNG.

    qlkp_platform    tenant, tài khoản, phân quyền, quỹ nền tảng, roadmap
    kp_<slug>        toàn bộ dữ liệu nghiệp vụ của MỘT khu phố

Vì sao tách vật lý thay vì dùng `tenant_id` + RLS trong một database:

  RLS chỉ bảo vệ được việc đọc, và chỉ khi lập trình viên không sai ở ba chỗ:
  kết nối phải bằng role không phải superuser, biến `app.tenant_id` phải sống
  qua mọi transaction, và khoá ngoại phải kiểm tra cùng tenant. Sai bất kỳ chỗ
  nào là rò dữ liệu — mà cả ba đều là lỗi im lặng, không báo gì.

  Tách database thì truy vấn viết sai đến mấy cũng chỉ chạm được dữ liệu của
  khu phố đang kết nối. Không phụ thuộc vào trí nhớ của ai.

Đổi lại phải chấp nhận: migration chạy trên N database, và thống kê toàn nền tảng
phải duyệt từng cái. Với quy mô vài nghìn bản ghi mỗi khu phố thì hoàn toàn ổn.
"""

import re
from collections.abc import AsyncGenerator

import structlog
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from khuphoso.core.config import get_settings

log = structlog.get_logger()
settings = get_settings()


class Base(DeclarativeBase):
    pass


def _url(db_name: str, *, admin: bool = False) -> str:
    user = settings.postgres_user if admin else (settings.postgres_app_user or settings.postgres_user)
    pw = settings.postgres_password if admin else (
        settings.postgres_app_password or settings.postgres_password
    )
    return (
        f"postgresql+asyncpg://{user}:{pw}"
        f"@{settings.postgres_host}:{settings.postgres_port}/{db_name}"
    )


def ten_db_khu_pho(slug: str) -> str:
    """`kp3-anphu` -> `kp_kp3_anphu`. Chỉ chấp nhận slug đã kiểm chuẩn."""
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,40}", slug):
        raise ValueError(f"Slug không hợp lệ: {slug!r}")
    return "kp_" + slug.replace("-", "_")


# --------------------------------------------------------------------------- #
# Cơ sở dữ liệu nền tảng
# --------------------------------------------------------------------------- #
platform_engine: AsyncEngine = create_async_engine(
    _url(settings.postgres_db), pool_size=10, max_overflow=20, pool_pre_ping=True
)
PlatformSession = async_sessionmaker(platform_engine, class_=AsyncSession, expire_on_commit=False)


async def get_platform_db() -> AsyncGenerator[AsyncSession, None]:
    """Phiên tới CSDL nền tảng — xác thực, tenant, quỹ nền tảng, roadmap."""
    async with PlatformSession() as s:
        yield s


# --------------------------------------------------------------------------- #
# Cơ sở dữ liệu của từng khu phố
# --------------------------------------------------------------------------- #
_engines: dict[str, AsyncEngine] = {}
_makers: dict[str, async_sessionmaker[AsyncSession]] = {}


def engine_khu_pho(slug: str) -> AsyncEngine:
    """Lấy (hoặc tạo) engine cho một khu phố. Pool nhỏ vì mỗi khu phố tải nhẹ."""
    if slug not in _engines:
        db = ten_db_khu_pho(slug)
        _engines[slug] = create_async_engine(
            _url(db), pool_size=3, max_overflow=5, pool_pre_ping=True, pool_recycle=1800
        )
        _makers[slug] = async_sessionmaker(
            _engines[slug], class_=AsyncSession, expire_on_commit=False
        )
        log.info("db.engine_created", slug=slug, db=db)
    return _engines[slug]


def session_khu_pho(slug: str) -> async_sessionmaker[AsyncSession]:
    engine_khu_pho(slug)
    return _makers[slug]


async def dong_engine_khu_pho(slug: str) -> None:
    """Đóng pool của một khu phố — dùng khi xoá hoặc tạm ngưng khu phố đó."""
    e = _engines.pop(slug, None)
    _makers.pop(slug, None)
    if e:
        await e.dispose()
        log.info("db.engine_disposed", slug=slug)


async def dong_tat_ca() -> None:
    for slug in list(_engines):
        await dong_engine_khu_pho(slug)
    await platform_engine.dispose()


def cac_slug_dang_mo() -> list[str]:
    return sorted(_engines)


# --------------------------------------------------------------------------- #
# Kết nối quản trị (tạo/xoá database, chạy migration)
# --------------------------------------------------------------------------- #
def admin_engine(db_name: str | None = None) -> AsyncEngine:
    """Engine bằng superuser. Dùng cho migration và cấp phát, KHÔNG dùng cho request."""
    return create_async_engine(
        _url(db_name or settings.postgres_db, admin=True),
        isolation_level="AUTOCOMMIT",
        poolclass=None,
    )
