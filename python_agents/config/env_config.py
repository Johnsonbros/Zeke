"""
Environment Configuration Loader

Loads and validates configuration from environment variables for the Python agent system.
"""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class RunBudgetConfig:
    """Run budget guard configuration."""
    max_tool_calls: int = 50
    max_seconds: int = 300


@dataclass
class CircuitBreakerConfig:
    """Circuit breaker configuration."""
    fail_threshold: int = 5
    cooldown_sec: int = 60


@dataclass
class LoggingConfig:
    """JSONL logging configuration."""
    max_bytes: int = 10_485_760  # 10MB
    retention_files: int = 5
    log_dir: str = "./logs"


@dataclass
class MemoryTTLConfig:
    """Memory TTL bucket configuration (in seconds)."""
    transient: int = 129_600  # 36 hours
    session: int = 604_800    # 7 days
    # long_term has no TTL (None = permanent)


@dataclass
class SLOConfig:
    """SLO target configuration."""
    cost_target_cents: int = 100  # $1.00
    p95_target_ms: int = 2000


@dataclass
class AgentConfig:
    """Combined agent configuration."""
    run_budget: RunBudgetConfig
    circuit_breaker: CircuitBreakerConfig
    logging: LoggingConfig
    memory_ttl: MemoryTTLConfig
    slo: SLOConfig
    
    openai_api_key: Optional[str] = None
    python_agents_port: int = 5001
    log_level: str = "INFO"
    node_bridge_url: str = "http://localhost:5000"
    internal_bridge_key: Optional[str] = None


def _get_int(key: str, default: int) -> int:
    """Get integer from environment with default."""
    value = os.environ.get(key)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _get_str(key: str, default: str) -> str:
    """Get string from environment with default."""
    return os.environ.get(key, default)


def load_config() -> AgentConfig:
    """Load configuration from environment variables."""
    return AgentConfig(
        run_budget=RunBudgetConfig(
            max_tool_calls=_get_int("RUN_MAX_TOOL_CALLS", 50),
            max_seconds=_get_int("RUN_MAX_SECONDS", 300),
        ),
        circuit_breaker=CircuitBreakerConfig(
            fail_threshold=_get_int("CB_FAIL_THRESHOLD", 5),
            cooldown_sec=_get_int("CB_COOLDOWN_SEC", 60),
        ),
        logging=LoggingConfig(
            max_bytes=_get_int("LOG_MAX_BYTES", 10_485_760),
            retention_files=_get_int("LOG_RETENTION_FILES", 5),
            log_dir=_get_str("LOG_DIR", "./logs"),
        ),
        memory_ttl=MemoryTTLConfig(
            transient=_get_int("MEM_TTL_TRANSIENT", 129_600),
            session=_get_int("MEM_TTL_SESSION", 604_800),
        ),
        slo=SLOConfig(
            cost_target_cents=_get_int("COST_TARGET_CENTS", 100),
            p95_target_ms=_get_int("P95_TARGET_MS", 2000),
        ),
        openai_api_key=os.environ.get("OPENAI_API_KEY"),
        python_agents_port=_get_int("PYTHON_AGENTS_PORT", 5001),
        log_level=_get_str("LOG_LEVEL", "INFO"),
        node_bridge_url=_get_str("NODE_BRIDGE_URL", "http://localhost:5000"),
        internal_bridge_key=os.environ.get("INTERNAL_BRIDGE_KEY"),
    )


# Singleton config instance
_config: Optional[AgentConfig] = None


def get_config() -> AgentConfig:
    """Get or create the singleton config instance."""
    global _config
    if _config is None:
        _config = load_config()
    return _config


def reload_config() -> AgentConfig:
    """Force reload configuration from environment."""
    global _config
    _config = load_config()
    return _config
