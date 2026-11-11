#!/usr/bin/env python3
"""Only the original GitHub submitter may propose changes to later annotations.

Validate the author against the BASE branch version of the result/provenance.
Never trust a provenance change included in the contributor's own PR.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JOB_ID = re.compile(r"^[A-Za-z0-9_-]{5,80}$")


def git(*args: str) -> str:
    p = subprocess.run(["git", *args], cwd=ROOT, check=True,
                       capture_output=True, text=True)
    return p.stdout


def read_at_commit(ref: str, path: str) -> dict | None:
    process = subprocess.run(["git", "show", f"{ref}:{path}"], cwd=ROOT,
                             capture_output=True, text=True)
    return json.loads(process.stdout) if process.returncode == 0 else None


def original_author(jobid: str, base: str, base_files: list[str], base_manifest: dict,
                    added_files: list[str]) -> str | None:
    matches = [path for path in base_files if Path(path).stem == jobid]
    if len(matches) > 1:
        raise ValueError(f"{jobid}: job ID is ambiguous in the base repository")
    if matches:
        payload = read_at_commit(base, matches[0]) or {}
        submission = payload.get("submission")
        if isinstance(submission, dict) and submission.get("github_username"):
            return submission["github_username"]
    else:
        # Allow simultaneous submission and annotations by the same PR author.
        fresh = [path for path in added_files if Path(path).stem == jobid]
        if len(fresh) == 1:
            payload = json.loads((ROOT / fresh[0]).read_text(encoding="utf-8"))
            submission = payload.get("submission")
            if isinstance(submission, dict):
                return submission.get("github_username")
        if fresh:
            raise ValueError(f"{jobid}: expected exactly one newly added result")
    original = base_manifest.get(jobid, {})
    return original.get("github_username") if isinstance(original, dict) else None


def main() -> int:
    author = os.environ.get("EXPECTED_PR_AUTHOR", "").strip()
    base = os.environ.get("BASE_SHA", "").strip()
    if not author or not base:
        print("Missing PR author or base SHA; annotation author validation cannot run.")
        return 1
    try:
        changes = git("diff", "--name-status", base, "HEAD", "--",
                      "submissions/annotations").splitlines()
        if not changes:
            print("No annotation changes in this pull request.")
            return 0
        base_files = [p for p in git("ls-tree", "-r", "--name-only", base,
                                    "results").splitlines() if p.endswith(".json")]
        added_files = git("diff", "--name-only", "--diff-filter=A", base,
                          "HEAD", "--", "results").splitlines()
        manifest = read_at_commit(base, "submissions/legacy-attribution.json") or {}
        errors = []
        checked = 0
        for change in changes:
            pieces = change.split("\t")
            change_kind, path = pieces[0], pieces[-1]
            if change_kind not in ("A", "M"):
                errors.append(f"{path}: annotations cannot be deleted or renamed")
                continue
            if not (path.startswith("submissions/annotations/") and path.endswith(".json")):
                errors.append(f"{path}: unexpected annotation path")
                continue
            jobid = Path(path).stem
            if not JOB_ID.fullmatch(jobid):
                errors.append(f"{path}: invalid job ID")
                continue
            try:
                annotation = json.loads((ROOT / path).read_text(encoding="utf-8"))
                original = original_author(jobid, base, base_files, manifest, added_files)
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                errors.append(f"{path}: {exc}")
                continue
            if not original:
                errors.append(f"{path}: original GitHub submitter not recorded in base results")
                continue
            if author.casefold() != original.casefold():
                errors.append(f"{path}: PR author @{author} is not the original submitter @{original}")
            if not isinstance(annotation, dict) or str(annotation.get("github_username", "")).casefold() != original.casefold():
                errors.append(f"{path}: annotation must identify the original submitter @{original}")
            checked += 1
        if errors:
            print("Annotation identity validation failed:\n" + "\n".join(errors))
            return 1
        print(f"Original submitter verified for {checked} annotation file(s).")
        return 0
    except (subprocess.CalledProcessError, OSError, json.JSONDecodeError) as exc:
        print(f"Failed to validate annotation PR: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
