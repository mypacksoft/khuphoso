"""KhuPhoSo API — bản cộng đồng (customer) cho một khu phố tự vận hành.

Bản này KHÔNG gồm phần nền tảng SaaS (onboarding, gói dịch vụ, thanh toán, quản trị
nền tảng). Mỗi khu phố tự cài trên máy chủ riêng; dữ liệu nằm trong database riêng.
"""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from khuphoso.core.config import get_settings
from khuphoso.core.database import PlatformSession, dong_tat_ca
from khuphoso.modules.admin.router import router as hethong_router
from khuphoso.modules.admin.taikhoan import router as taikhoan_router
from khuphoso.modules.auth.router import router as auth_router
from khuphoso.modules.danchu.router import cong_khai as congkhai_router
from khuphoso.modules.danchu.router import hoi_nghi as hoinghi_router
from khuphoso.modules.funds.router import router as funds_router
from khuphoso.modules.hoatdong.kinhdoanh import router as kinhdoanh_router
from khuphoso.modules.hoatdong.router import hop as lichhop_router
from khuphoso.modules.hoatdong.router import ke_hoach as kehoach_router
from khuphoso.modules.notifications.router import router as thongbao_router
from khuphoso.modules.phananh.router import router as phananh_router
from khuphoso.modules.residents.dinh_vi import router as dinhvi_router
from khuphoso.modules.residents.chuyen_kp import router as chuyenkp_router
from khuphoso.modules.residents.nhomkhoi import router as nhomkhoi_router
from khuphoso.modules.residents.so_nhom import router as sonhom_router
from khuphoso.modules.residents.gop_ho import router as gopho_router
from khuphoso.modules.residents.nhap_excel import router as nhapexcel_router
from khuphoso.modules.residents.tuyen_duong import router as tuyenduong_router
from khuphoso.modules.residents.households import router as households_router
from khuphoso.modules.residents.router import router as residents_router
from khuphoso.modules.lodging.router import router as lodging_router
from khuphoso.modules.events.router import router as events_router
from khuphoso.modules.portal.router import admin_router as cong_tt_router
from khuphoso.modules.portal.router import router as portal_router
from khuphoso.modules.vanban.router import router as vanban_router

settings = get_settings()
log = structlog.get_logger()

GIO_VN = timezone(timedelta(hours=7), "ICT")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("khuphoso.startup", env=settings.environment, domain=settings.public_domain)
    yield
    await dong_tat_ca()
    log.info("khuphoso.shutdown")


app = FastAPI(
    title="KhuPhoSo API",
    description="Nền tảng quản trị khu phố số — bản cộng đồng",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=rf"https://([a-z0-9-]+\.)?{settings.public_domain.replace(chr(46), chr(92)+chr(46))}",
    allow_origins=[f"https://{settings.public_domain}"],
    expose_headers=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(nhomkhoi_router)
app.include_router(sonhom_router)
app.include_router(chuyenkp_router)
app.include_router(residents_router)
app.include_router(funds_router)
app.include_router(lichhop_router)
app.include_router(kehoach_router)
app.include_router(kinhdoanh_router)
app.include_router(vanban_router)
app.include_router(phananh_router)
app.include_router(hoinghi_router)
app.include_router(congkhai_router)
app.include_router(thongbao_router)
app.include_router(hethong_router)
app.include_router(taikhoan_router)
# gopho_router phải đăng ký TRƯỚC households_router (xem chú thích bản gốc).
app.include_router(nhapexcel_router)
app.include_router(gopho_router)
app.include_router(dinhvi_router)
app.include_router(tuyenduong_router)
app.include_router(households_router)
app.include_router(lodging_router)
app.include_router(events_router)
app.include_router(portal_router)
app.include_router(cong_tt_router)


@app.get("/gio", tags=["system"])
async def gio_hien_tai():
    """Giờ Việt Nam theo đồng hồ máy chủ (UTC+7)."""
    bay_gio = datetime.now(GIO_VN)
    return {"iso": bay_gio.isoformat(), "epoch_ms": int(bay_gio.timestamp() * 1000), "tz": settings.tz}


@app.get("/health", tags=["system"])
async def health():
    result = {"status": "ok", "service": "khuphoso-api", "version": "0.1.0"}
    try:
        async with PlatformSession() as db:
            pg = (await db.execute(text("select version()"))).scalar_one()
            result["postgres"] = pg.split(",")[0]
    except Exception as exc:  # noqa: BLE001
        result["status"] = "degraded"
        result["database_error"] = str(exc)[:200]
    return result


@app.get("/", tags=["system"])
async def root():
    return {"name": "KhuPhoSo", "tagline": "Bớt giấy tờ, còn thời gian lo cho dân."}
