"""
Tests for rotating JSONL log writer with PII masking.
"""

import json
import os
import shutil
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest

from python_agents.logging.jsonl_writer import (
    PIIMasker,
    RotatingJSONLWriter,
)


class TestPIIMasker:
    """Tests for PII masking functionality."""
    
    def test_mask_phone_us_format(self):
        """Test masking US phone numbers."""
        text = "Call me at 555-123-4567"
        result = PIIMasker.mask_phone(text)
        assert "4567" not in result
        assert "555-***-****" in result
    
    def test_mask_phone_with_country_code(self):
        """Test masking phone with +1 country code."""
        text = "My number is +1-555-123-4567"
        result = PIIMasker.mask_phone(text)
        assert "4567" not in result
        assert "+1-555-***-****" in result
    
    def test_mask_phone_with_parens(self):
        """Test masking phone with parentheses."""
        text = "Call (555) 123-4567"
        result = PIIMasker.mask_phone(text)
        assert "4567" not in result
        assert "***-****" in result
    
    def test_mask_phone_dots(self):
        """Test masking phone with dots."""
        text = "555.123.4567"
        result = PIIMasker.mask_phone(text)
        assert "4567" not in result
    
    def test_mask_email_basic(self):
        """Test basic email masking."""
        text = "Email me at user@example.com"
        result = PIIMasker.mask_email(text)
        assert "user" not in result
        assert "u***@example.com" in result
    
    def test_mask_email_preserves_domain(self):
        """Test that email domain is preserved."""
        text = "contact@company.org"
        result = PIIMasker.mask_email(text)
        assert "company.org" in result
        assert "c***@company.org" in result
    
    def test_mask_email_complex(self):
        """Test masking complex email addresses."""
        text = "john.doe+test@subdomain.example.co.uk"
        result = PIIMasker.mask_email(text)
        assert "john" not in result
        assert "subdomain.example.co.uk" in result
    
    def test_mask_dict_recursively(self):
        """Test recursive masking of dictionaries."""
        data = {
            "name": "John",
            "phone": "555-123-4567",
            "contact": {
                "email": "john@example.com",
                "backup_phone": "555-987-6543"
            }
        }
        result = PIIMasker.mask(data)
        
        assert result["name"] == "John"
        assert "4567" not in result["phone"]
        assert "john" not in result["contact"]["email"]
        assert "6543" not in result["contact"]["backup_phone"]
    
    def test_mask_list_recursively(self):
        """Test recursive masking of lists."""
        data = [
            "555-123-4567",
            {"email": "test@example.com"},
            ["nested@email.org"]
        ]
        result = PIIMasker.mask(data)
        
        assert "4567" not in result[0]
        assert "test" not in result[1]["email"]
        assert "nested" not in result[2][0]
    
    def test_mask_preserves_non_pii(self):
        """Test that non-PII data is preserved."""
        data = {
            "message": "Hello world",
            "count": 42,
            "active": True,
            "data": None
        }
        result = PIIMasker.mask(data)
        
        assert result == data


class TestRotatingJSONLWriter:
    """Tests for rotating log writer."""
    
    @pytest.fixture
    def temp_log_dir(self):
        """Create a temporary log directory."""
        temp_dir = tempfile.mkdtemp()
        yield Path(temp_dir)
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    def test_creates_log_directory(self, temp_log_dir):
        """Test that log directory is created."""
        log_dir = temp_log_dir / "new_logs"
        writer = RotatingJSONLWriter(log_dir=log_dir)
        
        assert log_dir.exists()
        writer.close()
    
    def test_writes_jsonl_entry(self, temp_log_dir):
        """Test basic JSONL writing."""
        writer = RotatingJSONLWriter(log_dir=temp_log_dir)
        writer.write({"event": "test", "value": 123})
        writer.close()
        
        log_files = list(temp_log_dir.glob("*.jsonl"))
        assert len(log_files) == 1
        
        with open(log_files[0]) as f:
            entry = json.loads(f.readline())
            assert entry["event"] == "test"
            assert entry["value"] == 123
            assert "timestamp" in entry
    
    def test_masks_pii_in_entries(self, temp_log_dir):
        """Test that PII is masked in log entries."""
        writer = RotatingJSONLWriter(log_dir=temp_log_dir, mask_pii=True)
        writer.write({
            "phone": "555-123-4567",
            "email": "user@example.com"
        })
        writer.close()
        
        with open(writer.get_current_file()) as f:
            entry = json.loads(f.readline())
            assert "4567" not in entry["phone"]
            assert "user" not in entry["email"]
            assert "example.com" in entry["email"]
    
    def test_no_masking_when_disabled(self, temp_log_dir):
        """Test that PII is preserved when masking disabled."""
        writer = RotatingJSONLWriter(log_dir=temp_log_dir, mask_pii=False)
        writer.write({
            "phone": "555-123-4567",
            "email": "user@example.com"
        })
        writer.close()
        
        with open(writer.get_current_file()) as f:
            entry = json.loads(f.readline())
            assert entry["phone"] == "555-123-4567"
            assert entry["email"] == "user@example.com"
    
    def test_adds_timestamp_automatically(self, temp_log_dir):
        """Test that timestamp is added to entries."""
        writer = RotatingJSONLWriter(log_dir=temp_log_dir)
        writer.write({"event": "test"})
        writer.close()
        
        with open(writer.get_current_file()) as f:
            entry = json.loads(f.readline())
            assert "timestamp" in entry
            datetime.fromisoformat(entry["timestamp"])
    
    def test_preserves_existing_timestamp(self, temp_log_dir):
        """Test that existing timestamp is not overwritten."""
        writer = RotatingJSONLWriter(log_dir=temp_log_dir)
        custom_ts = "2024-01-01T00:00:00"
        writer.write({"event": "test", "timestamp": custom_ts})
        writer.close()
        
        with open(writer.get_current_file()) as f:
            entry = json.loads(f.readline())
            assert entry["timestamp"] == custom_ts


class TestSizeBasedRotation:
    """Tests for size-based log rotation."""
    
    @pytest.fixture
    def temp_log_dir(self):
        """Create a temporary log directory."""
        temp_dir = tempfile.mkdtemp()
        yield Path(temp_dir)
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    def test_rotates_on_size_limit(self, temp_log_dir):
        """Test rotation when size limit is reached."""
        small_max = 500
        writer = RotatingJSONLWriter(
            log_dir=temp_log_dir,
            max_size_bytes=small_max
        )
        
        for i in range(50):
            writer.write({"index": i, "data": "x" * 50})
        
        writer.close()
        
        log_files = list(temp_log_dir.glob("*.jsonl"))
        assert len(log_files) > 1
    
    def test_1000_entries_with_rotation(self, temp_log_dir):
        """Test generating 1000 entries with rotation."""
        small_max = 1024
        writer = RotatingJSONLWriter(
            log_dir=temp_log_dir,
            max_size_bytes=small_max
        )
        
        for i in range(1000):
            writer.write({
                "index": i,
                "phone": f"555-{100+i:03d}-{1000+i:04d}",
                "email": f"user{i}@test.com",
                "message": f"Log entry number {i}"
            })
        
        writer.close()
        
        log_files = writer.get_all_log_files()
        assert len(log_files) > 1
        
        total_lines = 0
        for log_file in log_files:
            with open(log_file) as f:
                total_lines += sum(1 for _ in f)
        
        assert total_lines == 1000


class TestTimeBasedRotation:
    """Tests for time-based (daily) log rotation."""
    
    @pytest.fixture
    def temp_log_dir(self):
        """Create a temporary log directory."""
        temp_dir = tempfile.mkdtemp()
        yield Path(temp_dir)
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    def test_rotates_on_date_change(self, temp_log_dir):
        """Test rotation when date changes."""
        writer = RotatingJSONLWriter(log_dir=temp_log_dir)
        
        writer.write({"event": "day1"})
        first_file = writer.get_current_file()
        
        with patch.object(
            writer, '_get_current_date',
            return_value=(datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        ):
            writer.write({"event": "day2"})
            second_file = writer.get_current_file()
        
        writer.close()
        
        assert first_file != second_file
        assert first_file.exists()
        assert second_file.exists()


class TestRetentionCleanup:
    """Tests for log retention and cleanup."""
    
    @pytest.fixture
    def temp_log_dir(self):
        """Create a temporary log directory."""
        temp_dir = tempfile.mkdtemp()
        yield Path(temp_dir)
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    def test_cleanup_deletes_old_files(self, temp_log_dir):
        """Test that old files are deleted during cleanup."""
        old_date = (datetime.now() - timedelta(days=35)).strftime("%Y-%m-%d")
        old_file = temp_log_dir / f"agent_{old_date}_0.jsonl"
        old_file.write_text('{"old": true}\n')
        
        recent_date = datetime.now().strftime("%Y-%m-%d")
        recent_file = temp_log_dir / f"agent_{recent_date}_0.jsonl"
        recent_file.write_text('{"recent": true}\n')
        
        writer = RotatingJSONLWriter(log_dir=temp_log_dir, retention_days=30)
        
        assert not old_file.exists()
        assert recent_file.exists()
        
        writer.close()
    
    def test_retention_30_days(self, temp_log_dir):
        """Test 30-day retention policy."""
        for days_ago in [0, 15, 29, 30, 31, 60]:
            date = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d")
            log_file = temp_log_dir / f"agent_{date}_0.jsonl"
            log_file.write_text(f'{{"days_ago": {days_ago}}}\n')
        
        writer = RotatingJSONLWriter(log_dir=temp_log_dir, retention_days=30)
        
        remaining_files = list(temp_log_dir.glob("agent_*.jsonl"))
        
        assert len(remaining_files) == 3
        
        for log_file in remaining_files:
            date_str = log_file.stem.split("_")[1]
            file_date = datetime.strptime(date_str, "%Y-%m-%d")
            assert (datetime.now() - file_date).days < 30
        
        writer.close()
    
    def test_manual_cleanup(self, temp_log_dir):
        """Test manual cleanup returns count of deleted files."""
        for days_ago in [35, 40, 45]:
            date = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d")
            log_file = temp_log_dir / f"agent_{date}_0.jsonl"
            log_file.write_text(f'{{"days_ago": {days_ago}}}\n')
        
        writer = RotatingJSONLWriter(log_dir=temp_log_dir, retention_days=30)
        
        remaining = list(temp_log_dir.glob("agent_*.jsonl"))
        assert len(remaining) == 0
        
        writer.close()


class TestContextManager:
    """Tests for context manager support."""
    
    @pytest.fixture
    def temp_log_dir(self):
        """Create a temporary log directory."""
        temp_dir = tempfile.mkdtemp()
        yield Path(temp_dir)
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    def test_context_manager(self, temp_log_dir):
        """Test using writer as context manager."""
        with RotatingJSONLWriter(log_dir=temp_log_dir) as writer:
            writer.write({"event": "test"})
            log_file = writer.get_current_file()
        
        assert log_file.exists()
        with open(log_file) as f:
            entry = json.loads(f.readline())
            assert entry["event"] == "test"


class TestThreadSafety:
    """Tests for thread safety."""
    
    @pytest.fixture
    def temp_log_dir(self):
        """Create a temporary log directory."""
        temp_dir = tempfile.mkdtemp()
        yield Path(temp_dir)
        shutil.rmtree(temp_dir, ignore_errors=True)
    
    def test_concurrent_writes(self, temp_log_dir):
        """Test concurrent writes from multiple threads."""
        import threading
        
        writer = RotatingJSONLWriter(log_dir=temp_log_dir)
        num_threads = 10
        writes_per_thread = 100
        
        def write_entries(thread_id: int):
            for i in range(writes_per_thread):
                writer.write({"thread": thread_id, "index": i})
        
        threads = [
            threading.Thread(target=write_entries, args=(t,))
            for t in range(num_threads)
        ]
        
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        
        writer.close()
        
        total_entries = 0
        for log_file in writer.get_all_log_files():
            with open(log_file) as f:
                for line in f:
                    json.loads(line)
                    total_entries += 1
        
        assert total_entries == num_threads * writes_per_thread
