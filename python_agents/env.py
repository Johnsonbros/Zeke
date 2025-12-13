"""
Centralized Environment Validation for Python Agents

Fail-fast validation for required environment variables.
Import this module early in any Python agent entry point.
"""

import os
import sys
from typing import Optional


REQUIRED_ENV_VARS = [
    "OPENAI_API_KEY",
    "DATABASE_URL", 
    "JWT_SECRET",
]

OPTIONAL_ENV_VARS = [
    "APP_NAME",
    "APP_ENV",
    "PORT",
    "LOG_LEVEL",
    "INTERNAL_BRIDGE_KEY",
    "NODE_BRIDGE_URL",
    "PYTHON_AGENTS_PORT",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_PHONE_NUMBER",
    "PERPLEXITY_API_KEY",
    "OMI_API_KEY",
]


class EnvValidationError(Exception):
    """Raised when required environment variables are missing."""
    pass


def validate_env() -> dict[str, str]:
    """
    Validate that all required environment variables are set.
    
    Returns:
        dict with all environment variable values
        
    Raises:
        SystemExit if required variables are missing
    """
    missing_vars = []
    env_values = {}
    
    for var in REQUIRED_ENV_VARS:
        value = os.environ.get(var)
        if not value:
            missing_vars.append(var)
        else:
            env_values[var] = value
    
    for var in OPTIONAL_ENV_VARS:
        value = os.environ.get(var)
        if value:
            env_values[var] = value
    
    if missing_vars:
        error_msg = (
            "\n" + "=" * 60 + "\n"
            "ENVIRONMENT CONFIGURATION ERROR\n"
            "=" * 60 + "\n\n"
            f"Missing required environment variables:\n"
            f"  - {chr(10).join('  - ' + var for var in missing_vars)}\n\n"
            "Refer to .env.example and .env.schema for required variables.\n"
            "=" * 60 + "\n"
        )
        print(error_msg, file=sys.stderr)
        sys.exit(1)
    
    return env_values


def get_env(key: str, default: Optional[str] = None) -> Optional[str]:
    """Get an environment variable value."""
    return os.environ.get(key, default)


def require_env(key: str) -> str:
    """
    Get a required environment variable value.
    
    Raises:
        EnvValidationError if the variable is not set
    """
    value = os.environ.get(key)
    if not value:
        raise EnvValidationError(f"Required environment variable {key} is not set")
    return value


_validated = False
_env_values: dict[str, str] = {}


def ensure_env() -> dict[str, str]:
    """
    Ensure environment is validated. Call this at module import time.
    
    Returns:
        dict with validated environment values
    """
    global _validated, _env_values
    if not _validated:
        _env_values = validate_env()
        _validated = True
    return _env_values


OPENAI_API_KEY: str = ""
DATABASE_URL: str = ""
JWT_SECRET: str = ""


def init():
    """Initialize environment variables. Call at startup."""
    global OPENAI_API_KEY, DATABASE_URL, JWT_SECRET
    env_values = ensure_env()
    OPENAI_API_KEY = env_values.get("OPENAI_API_KEY", "")
    DATABASE_URL = env_values.get("DATABASE_URL", "")
    JWT_SECRET = env_values.get("JWT_SECRET", "")
