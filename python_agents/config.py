"""
Configuration settings for ZEKE Python Agents microservice.

This module uses Pydantic Settings for type-safe configuration management
with environment variable loading.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    
    Attributes:
        openai_api_key: API key for OpenAI services
        internal_bridge_key: Secret key for authenticating with Node.js API
        node_bridge_url: Base URL for the Node.js API bridge
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        python_agents_port: Port for the Python agents service
    """
    
    openai_api_key: str = Field(
        default="",
        description="OpenAI API key for agent operations"
    )
    
    internal_bridge_key: str = Field(
        default="",
        description="Secret key for authenticating bridge calls to Node.js API"
    )
    
    node_bridge_url: str = Field(
        default="http://localhost:5000",
        description="Base URL for the Node.js API bridge"
    )
    
    log_level: str = Field(
        default="INFO",
        description="Logging level"
    )
    
    python_agents_port: int = Field(
        default=5001,
        description="Port for the Python agents FastAPI service"
    )
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    
    Uses lru_cache to ensure settings are only loaded once.
    
    Returns:
        Settings: The application settings instance
    """
    return Settings()
