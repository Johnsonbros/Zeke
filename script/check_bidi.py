#!/usr/bin/env python3
"""
Fail if bidirectional control characters are present in tracked source files.
"""
from __future__ import annotations
import os
import sys
from typing import Iterable

BIDI_CODEPOINTS = [
    0x202A, 0x202B, 0x202C, 0x202D, 0x202E,  # RLO etc
    0x2066, 0x2067, 0x2068, 0x2069,
]

EXCLUDED_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "server/public",
    "migrations",
    "venv",
    "__pycache__",
    "attached_assets",
    "data",
}


def iter_files(root: str) -> Iterable[str]:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDED_DIRS and not d.startswith(".")]
        for name in filenames:
            if name.startswith('.'):
                continue
            path = os.path.join(dirpath, name)
            if os.path.islink(path):
                continue
            yield path


def has_bidi_controls(content: str) -> bool:
    return any(ord(ch) in BIDI_CODEPOINTS for ch in content)


def main() -> int:
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    failures: list[str] = []

    for path in iter_files(repo_root):
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
        except (OSError, UnicodeDecodeError):
            continue
        if has_bidi_controls(text):
            failures.append(os.path.relpath(path, repo_root))

    if failures:
        sys.stderr.write("Detected bidirectional Unicode control characters in:\n")
        for path in failures:
            sys.stderr.write(f"  - {path}\n")
        return 1

    print("No bidirectional control characters detected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
