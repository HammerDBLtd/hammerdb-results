#!/usr/bin/env python3
"""Ensure new result artifacts are attributed to the authenticated GitHub PR author."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    expected = os.environ.get("EXPECTED_PR_AUTHOR", "").strip()
    base = os.environ.get("BASE_SHA", "").strip()
    if not expected or not base:
        print("PR attribution check requires EXPECTED_PR_AUTHOR and BASE_SHA.")
        return 1

    try:
        diff = subprocess.run(
            ["git", "diff", "--name-only", "--diff-filter=A", base, "HEAD", "--", "results"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        )
    except subprocess.CalledProcessError as exc:
        print(f"Failed to retrieve PR changes: {exc.stderr}")
        return 1

    errors = []
    found = 0
    for rel in diff.stdout.splitlines():
        if not rel.startswith("results/") or not rel.endswith(".json"):
            continue
        found += 1
        payload = json.loads((ROOT / rel).read_text(encoding="utf-8"))
        submission = payload.get("submission") or {}
        username = submission.get("github_username")
        if not isinstance(username, str) or username.casefold() != expected.casefold():
            errors.append(f"{rel}: submitted by {username!r}; PR author is @{expected}. "
                          "Use the authenticated GitHub account submitting this pull request.")
    if errors:
        print("GitHub submitter check failed:\n" + "\n".join(errors))
        return 1
    print(f"Verified submitter identity for {found} new result artifact(s); PR author @{expected}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
