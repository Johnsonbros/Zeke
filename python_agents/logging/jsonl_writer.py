"""
Rotating JSONL log writer with PII masking and retention cleanup.

Features:
- Size-based rotation (default 10MB)
- Time-based rotation (daily)
- PII masking for phone numbers and emails
- 30-day retention with automatic cleanup
"""

import json
import os
import re
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


class PIIMasker:
    """
    Masks personally identifiable information in log entries.
    
    Handles:
    - Phone numbers: +1-555-123-4567 -> +1-555-***-****
    - Emails: user@domain.com -> u***@domain.com
    """
    
    PHONE_PATTERN = re.compile(
        r'(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}'
    )
    
    EMAIL_PATTERN = re.compile(
        r'([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})'
    )
    
    @classmethod
    def mask_phone(cls, text: str) -> str:
        """Mask phone numbers, preserving area code prefix."""
        def replacer(match: re.Match) -> str:
            prefix = match.group(1)
            return f"{prefix}***-****"
        return cls.PHONE_PATTERN.sub(replacer, text)
    
    @classmethod
    def mask_email(cls, text: str) -> str:
        """Mask emails, preserving first char and domain."""
        def replacer(match: re.Match) -> str:
            first_char = match.group(1)
            domain = match.group(2)
            return f"{first_char}***@{domain}"
        return cls.EMAIL_PATTERN.sub(replacer, text)
    
    @classmethod
    def mask(cls, value: Any) -> Any:
        """
        Recursively mask PII in any value (str, dict, list).
        
        Args:
            value: Any JSON-serializable value
            
        Returns:
            Value with PII masked
        """
        if isinstance(value, str):
            result = cls.mask_phone(value)
            result = cls.mask_email(result)
            return result
        elif isinstance(value, dict):
            return {k: cls.mask(v) for k, v in value.items()}
        elif isinstance(value, list):
            return [cls.mask(item) for item in value]
        else:
            return value


class RotatingJSONLWriter:
    """
    Thread-safe rotating JSONL log writer.
    
    Features:
    - Daily rotation (new file each day)
    - Size-based rotation (configurable, default 10MB)
    - PII masking before writing
    - 30-day retention with automatic cleanup
    
    Log files are named: {prefix}_{date}_{rotation_index}.jsonl
    Example: agent_2024-12-17_0.jsonl
    """
    
    DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10MB
    DEFAULT_RETENTION_DAYS = 30
    
    def __init__(
        self,
        log_dir: str | Path = "logs",
        prefix: str = "agent",
        max_size_bytes: int = DEFAULT_MAX_SIZE_BYTES,
        retention_days: int = DEFAULT_RETENTION_DAYS,
        mask_pii: bool = True,
    ):
        """
        Initialize the rotating log writer.
        
        Args:
            log_dir: Directory to write logs to
            prefix: Prefix for log file names
            max_size_bytes: Max size before rotation (default 10MB)
            retention_days: Days to keep logs (default 30)
            mask_pii: Whether to mask PII (default True)
        """
        self.log_dir = Path(log_dir)
        self.prefix = prefix
        self.max_size_bytes = max_size_bytes
        self.retention_days = retention_days
        self.mask_pii = mask_pii
        
        self._lock = threading.Lock()
        self._current_file: Path | None = None
        self._current_date: str | None = None
        self._rotation_index: int = 0
        self._file_handle = None
        
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        self._cleanup_old_logs()
    
    def _get_current_date(self) -> str:
        """Get current date as YYYY-MM-DD."""
        return datetime.now().strftime("%Y-%m-%d")
    
    def _get_log_filename(self, date: str, index: int) -> str:
        """Generate log filename for given date and rotation index."""
        return f"{self.prefix}_{date}_{index}.jsonl"
    
    def _get_log_path(self, date: str, index: int) -> Path:
        """Get full path to log file."""
        return self.log_dir / self._get_log_filename(date, index)
    
    def _should_rotate(self) -> bool:
        """Check if rotation is needed (date change or size exceeded)."""
        current_date = self._get_current_date()
        
        if self._current_date != current_date:
            return True
        
        if self._current_file and self._current_file.exists():
            if self._current_file.stat().st_size >= self.max_size_bytes:
                return True
        
        return False
    
    def _rotate(self) -> None:
        """Perform log rotation."""
        if self._file_handle:
            self._file_handle.close()
            self._file_handle = None
        
        current_date = self._get_current_date()
        
        if self._current_date != current_date:
            self._current_date = current_date
            self._rotation_index = 0
        else:
            self._rotation_index += 1
        
        while True:
            new_path = self._get_log_path(self._current_date, self._rotation_index)
            if not new_path.exists() or new_path.stat().st_size < self.max_size_bytes:
                break
            self._rotation_index += 1
        
        self._current_file = new_path
        self._file_handle = open(self._current_file, "a", encoding="utf-8")
    
    def _ensure_file_open(self) -> None:
        """Ensure we have a valid open file handle."""
        if self._should_rotate() or self._file_handle is None:
            self._rotate()
    
    def write(self, entry: dict[str, Any]) -> None:
        """
        Write a log entry to the current log file.
        
        Automatically handles:
        - PII masking (if enabled)
        - Timestamp injection
        - Rotation on size/date change
        
        Args:
            entry: Dictionary to write as JSON line
        """
        if self.mask_pii:
            entry = PIIMasker.mask(entry)
        
        if "timestamp" not in entry:
            entry["timestamp"] = datetime.now().isoformat()
        
        with self._lock:
            self._ensure_file_open()
            line = json.dumps(entry, default=str) + "\n"
            self._file_handle.write(line)
            self._file_handle.flush()
    
    def _cleanup_old_logs(self) -> None:
        """Delete log files older than retention period."""
        cutoff = datetime.now() - timedelta(days=self.retention_days)
        
        pattern = f"{self.prefix}_*.jsonl"
        for log_file in self.log_dir.glob(pattern):
            try:
                parts = log_file.stem.split("_")
                if len(parts) >= 2:
                    date_str = parts[1]
                    file_date = datetime.strptime(date_str, "%Y-%m-%d")
                    if file_date < cutoff:
                        log_file.unlink()
            except (ValueError, IndexError):
                continue
    
    def cleanup(self) -> int:
        """
        Manually trigger cleanup of old logs.
        
        Returns:
            Number of files deleted
        """
        cutoff = datetime.now() - timedelta(days=self.retention_days)
        deleted = 0
        
        pattern = f"{self.prefix}_*.jsonl"
        for log_file in self.log_dir.glob(pattern):
            try:
                parts = log_file.stem.split("_")
                if len(parts) >= 2:
                    date_str = parts[1]
                    file_date = datetime.strptime(date_str, "%Y-%m-%d")
                    if file_date < cutoff:
                        log_file.unlink()
                        deleted += 1
            except (ValueError, IndexError):
                continue
        
        return deleted
    
    def close(self) -> None:
        """Close the current log file handle."""
        with self._lock:
            if self._file_handle:
                self._file_handle.close()
                self._file_handle = None
    
    def get_current_file(self) -> Path | None:
        """Get the path to the current log file."""
        return self._current_file
    
    def get_all_log_files(self) -> list[Path]:
        """Get all log files in the log directory."""
        pattern = f"{self.prefix}_*.jsonl"
        return sorted(self.log_dir.glob(pattern))
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


_default_writer: RotatingJSONLWriter | None = None
_writer_lock = threading.Lock()


def get_log_writer(
    log_dir: str | Path = "logs",
    prefix: str = "agent",
    **kwargs,
) -> RotatingJSONLWriter:
    """
    Get or create the default log writer singleton.
    
    Args:
        log_dir: Directory for log files
        prefix: Log file prefix
        **kwargs: Additional arguments for RotatingJSONLWriter
        
    Returns:
        RotatingJSONLWriter instance
    """
    global _default_writer
    
    with _writer_lock:
        if _default_writer is None:
            _default_writer = RotatingJSONLWriter(
                log_dir=log_dir,
                prefix=prefix,
                **kwargs,
            )
        return _default_writer
