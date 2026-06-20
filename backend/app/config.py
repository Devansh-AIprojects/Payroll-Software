from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

# Resolve .env relative to this file's location (backend/app/config.py → backend/.env)
# This makes it work regardless of where the server process is launched from.
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    database_url: str

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Auth
    secret_key: str
    access_token_expire_minutes: int = 480  # 8 hours — suits a mill HR shift

    # Fingerprint template encryption (Fernet key)
    encryption_key: str

    # App
    app_env: str = "development"
    app_debug: bool = False

    # CORS — comma-separated list of allowed frontend origins, REQUIRED in production.
    # e.g. CORS_ALLOWED_ORIGINS=https://payroll.stccotyarn.com,https://www.stccotyarn.com
    # In development this is ignored — all origins are allowed for convenience.
    cors_allowed_origins: str = ""

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def cors_origins_list(self) -> list[str]:
        """
        Dev: allow everything, no setup needed.
        Prod: explicit allowlist only — never falls back to '*' or '' silently.
        Empty in prod is treated as a misconfiguration, not "no one is allowed in" —
        see the startup check in main.py that refuses to boot in that case.
        """
        if not self.is_production:
            return ["*"]
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
