"""
Unified Environment Configuration for Python Agents.

Validates environment variables against the schema defined in .env.schema.
Throws descriptive errors if required variables are missing or invalid.
"""

import os
import sys
from enum import Enum
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class AppEnv(str, Enum):
    """Valid application environment values."""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class LogLevel(str, Enum):
    """Valid log level values."""
    DEBUG = "debug"
    INFO = "info"
    WARN = "warn"
    ERROR = "error"


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    
    Validates against .env.schema requirements.
    """
    
    app_name: str = Field(
        ...,
        min_length=1,
        description="Application name"
    )
    
    app_env: AppEnv = Field(
        ...,
        description="Runtime environment (development|staging|production)"
    )
    
    port: int = Field(
        ...,
        gt=0,
        description="Server port"
    )
    
    database_url: str = Field(
        ...,
        min_length=1,
        description="PostgreSQL connection string"
    )
    
    jwt_secret: str = Field(
        ...,
        min_length=1,
        description="Secret key for JWT token signing"
    )
    
    openai_api_key: str = Field(
        ...,
        min_length=1,
        description="OpenAI API key for AI features"
    )
    
    log_level: LogLevel = Field(
        ...,
        description="Application log level (debug|info|warn|error)"
    )
    
    internal_bridge_key: str = Field(
        default="",
        description="Secret key for authenticating bridge calls to Node.js API"
    )
    
    node_bridge_url: str = Field(
        default="http://localhost:5000",
        description="Base URL for the Node.js API bridge"
    )
    
    python_agents_port: int = Field(
        default=5001,
        description="Port for the Python agents FastAPI service"
    )
    
    @field_validator("app_env", mode="before")
    @classmethod
    def validate_app_env(cls, v: str) -> str:
        if isinstance(v, str):
            v = v.lower()
        return v
    
    @field_validator("log_level", mode="before")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        if isinstance(v, str):
            v = v.lower()
        return v

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


def validate_config() -> Settings:
    """
    Validate and load configuration from environment variables.
    
    Raises:
        SystemExit: If required variables are missing or invalid.
    
    Returns:
        Settings: Validated configuration object.
    """
    required_vars = [
        "APP_NAME",
        "APP_ENV",
        "PORT",
        "DATABASE_URL",
        "JWT_SECRET",
        "OPENAI_API_KEY",
        "LOG_LEVEL",
    ]
    
    missing_vars = [var for var in required_vars if not os.environ.get(var)]
    
    if missing_vars:
        error_msg = (
            "Environment configuration validation failed:\n\n"
            f"Missing required environment variables:\n"
            f"  - {chr(10).join(f'  - {var}' for var in missing_vars)}\n\n"
            "Refer to .env.schema for required variables and their expected formats."
        )
        print(error_msg, file=sys.stderr)
        raise SystemExit(1)
    
    try:
        return Settings()
    except Exception as e:
        error_msg = (
            f"Environment configuration validation failed:\n\n{str(e)}\n\n"
            "Refer to .env.schema for required variables and their expected formats."
        )
        print(error_msg, file=sys.stderr)
        raise SystemExit(1)


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    
    Uses lru_cache to ensure settings are only loaded once.
    
    Returns:
        Settings: The application settings instance.
    """
    return validate_config()


def is_development() -> bool:
    """Check if running in development environment."""
    return get_settings().app_env == AppEnv.DEVELOPMENT


def is_production() -> bool:
    """Check if running in production environment."""
    return get_settings().app_env == AppEnv.PRODUCTION


def is_staging() -> bool:
    """Check if running in staging environment."""
    return get_settings().app_env == AppEnv.STAGING
