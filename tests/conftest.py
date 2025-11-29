"""
Root conftest.py for pytest configuration.

This ensures the python_agents module is discoverable.
"""

import sys
from pathlib import Path

root_dir = Path(__file__).parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

pytest_plugins = ('pytest_asyncio',)
