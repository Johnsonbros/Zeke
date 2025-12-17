"""Tests for environment configuration loader."""

import os
import pytest
from unittest.mock import patch

from python_agents.config.env_config import (
    load_config,
    get_config,
    reload_config,
    RunBudgetConfig,
    CircuitBreakerConfig,
    LoggingConfig,
    MemoryTTLConfig,
    SLOConfig,
)


class TestLoadConfig:
    """Tests for load_config function."""

    def test_load_defaults(self):
        """Should load default values when no env vars set."""
        with patch.dict(os.environ, {}, clear=True):
            config = load_config()
            
            assert config.run_budget.max_tool_calls == 50
            assert config.run_budget.max_seconds == 300
            assert config.circuit_breaker.fail_threshold == 5
            assert config.circuit_breaker.cooldown_sec == 60
            assert config.logging.max_bytes == 10_485_760
            assert config.logging.retention_files == 5
            assert config.memory_ttl.transient == 129_600
            assert config.memory_ttl.session == 604_800
            assert config.slo.cost_target_cents == 100
            assert config.slo.p95_target_ms == 2000

    def test_load_from_env(self):
        """Should load values from environment variables."""
        env_vars = {
            "RUN_MAX_TOOL_CALLS": "100",
            "RUN_MAX_SECONDS": "600",
            "CB_FAIL_THRESHOLD": "10",
            "CB_COOLDOWN_SEC": "120",
            "LOG_MAX_BYTES": "5242880",
            "LOG_RETENTION_FILES": "10",
            "MEM_TTL_TRANSIENT": "86400",
            "MEM_TTL_SESSION": "259200",
            "COST_TARGET_CENTS": "200",
            "P95_TARGET_MS": "3000",
        }
        
        with patch.dict(os.environ, env_vars, clear=True):
            config = load_config()
            
            assert config.run_budget.max_tool_calls == 100
            assert config.run_budget.max_seconds == 600
            assert config.circuit_breaker.fail_threshold == 10
            assert config.circuit_breaker.cooldown_sec == 120
            assert config.logging.max_bytes == 5_242_880
            assert config.logging.retention_files == 10
            assert config.memory_ttl.transient == 86_400
            assert config.memory_ttl.session == 259_200
            assert config.slo.cost_target_cents == 200
            assert config.slo.p95_target_ms == 3000

    def test_invalid_int_uses_default(self):
        """Should use default when env var is not a valid integer."""
        with patch.dict(os.environ, {"RUN_MAX_TOOL_CALLS": "not_a_number"}, clear=True):
            config = load_config()
            assert config.run_budget.max_tool_calls == 50

    def test_partial_env_vars(self):
        """Should mix defaults with provided env vars."""
        with patch.dict(os.environ, {"RUN_MAX_TOOL_CALLS": "75"}, clear=True):
            config = load_config()
            
            assert config.run_budget.max_tool_calls == 75
            assert config.run_budget.max_seconds == 300  # default

    def test_openai_api_key(self):
        """Should load OpenAI API key if present."""
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test-key"}, clear=True):
            config = load_config()
            assert config.openai_api_key == "sk-test-key"

    def test_python_agents_port(self):
        """Should load custom Python agents port."""
        with patch.dict(os.environ, {"PYTHON_AGENTS_PORT": "8080"}, clear=True):
            config = load_config()
            assert config.python_agents_port == 8080


class TestSingletonConfig:
    """Tests for singleton config pattern."""

    def test_get_config_returns_same_instance(self):
        """get_config should return the same instance."""
        import python_agents.config.env_config as env_config
        env_config._config = None
        
        config1 = get_config()
        config2 = get_config()
        
        assert config1 is config2

    def test_reload_config_creates_new_instance(self):
        """reload_config should create a new config instance."""
        import python_agents.config.env_config as env_config
        env_config._config = None
        
        config1 = get_config()
        
        with patch.dict(os.environ, {"RUN_MAX_TOOL_CALLS": "999"}, clear=True):
            config2 = reload_config()
        
        assert config1 is not config2
        assert config2.run_budget.max_tool_calls == 999


class TestConfigDataclasses:
    """Tests for config dataclass defaults."""

    def test_run_budget_config_defaults(self):
        """RunBudgetConfig should have correct defaults."""
        config = RunBudgetConfig()
        assert config.max_tool_calls == 50
        assert config.max_seconds == 300

    def test_circuit_breaker_config_defaults(self):
        """CircuitBreakerConfig should have correct defaults."""
        config = CircuitBreakerConfig()
        assert config.fail_threshold == 5
        assert config.cooldown_sec == 60

    def test_logging_config_defaults(self):
        """LoggingConfig should have correct defaults."""
        config = LoggingConfig()
        assert config.max_bytes == 10_485_760
        assert config.retention_files == 5
        assert config.log_dir == "./logs"

    def test_memory_ttl_config_defaults(self):
        """MemoryTTLConfig should have correct defaults."""
        config = MemoryTTLConfig()
        assert config.transient == 129_600
        assert config.session == 604_800

    def test_slo_config_defaults(self):
        """SLOConfig should have correct defaults."""
        config = SLOConfig()
        assert config.cost_target_cents == 100
        assert config.p95_target_ms == 2000
