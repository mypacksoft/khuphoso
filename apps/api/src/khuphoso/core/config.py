from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5442
    postgres_db: str = "qlkp"
    postgres_user: str = "postgres"
    postgres_password: str = ""
    # Tài khoản ứng dụng — KHÔNG superuser. Cách ly giữa các khu phố dựa vào việc
    # mỗi khu phố một database, nhưng tài khoản thường vẫn là lớp chặn thứ hai:
    # superuser đọc được mọi database trên máy chủ.
    postgres_app_user: str = ""
    postgres_app_password: str = ""

    redis_url: str = "redis://127.0.0.1:6399/0"
    api_port: int = 8100
    secret_key: str = ""
    public_domain: str = "khuphoso.vn"
    tz: str = "Asia/Ho_Chi_Minh"

    environment: str = "development"

    # Google Geocoding — dò toạ độ từ địa chỉ chữ (tuỳ chọn). Không có khoá thì
    # chức năng định vị tự động báo lỗi rõ ràng chứ không âm thầm dùng nguồn khác.
    google_maps_api_key: str = ""

    @property
    def database_url(self) -> str:
        """Kết nối của ứng dụng — ưu tiên tài khoản không phải superuser."""
        user = self.postgres_app_user or self.postgres_user
        pw = self.postgres_app_password if self.postgres_app_user else self.postgres_password
        return (
            f"postgresql+asyncpg://{user}:{pw}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def admin_database_url(self) -> str:
        """Kết nối quản trị (migration, bảo trì) — dùng superuser."""
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
