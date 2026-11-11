#!/usr/bin/env python3
"""Build the public leaderboard data from immutable HammerDB result artifacts.

The HTML is a static client-side view: its styling and interactions live in
site/index.html, site/leaderboard.css and site/leaderboard.js.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from result_validation import format_validation_failure, validate_artifacts

REPO_ROOT = Path(__file__).resolve().parent.parent
RESULTS_ROOT = REPO_ROOT / "results"
SITE_ROOT = REPO_ROOT / "site"
LEADERBOARD_JSON = SITE_ROOT / "leaderboard.json"
INDEX_HTML = SITE_ROOT / "index.html"
SUPPORTED_TPROC_H_SCALE_FACTORS = (1, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000)


def _legacy_attribution() -> dict:
    path = REPO_ROOT / "submissions" / "legacy-attribution.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _submission_fields(payload: dict, legacy: dict) -> dict:
    """Keep submission declarations distinct from measurements in the artifact.

    Performance telemetry cannot establish whether a run was configured to
    stress CPU or storage. The declaration is only displayed if UAW and
    durability evidence is supplied and consistent.
    """
    job = payload.get("job") or {}
    submission = payload.get("submission")
    submission = submission if isinstance(submission, dict) else {}
    company = submission.get("company")
    company = company if isinstance(company, dict) else {}
    workload = submission.get("workload")
    workload = workload if isinstance(workload, dict) else {}
    legacy_info = legacy.get(job.get("jobid"), {})
    if not isinstance(legacy_info, dict):
        legacy_info = {}

    submitter = submission.get("github_username") or legacy_info.get("github_username")
    attribution = ("submission" if submission.get("github_username") else
                   "original-pr" if legacy_info.get("github_username") else "unknown")
    kind = workload.get("classification", "unclassified")
    uaw = workload.get("use_all_warehouses")
    durability = workload.get("durability", "unknown")
    details = str(workload.get("details") or "").strip()
    benchmark = job.get("benchmark")

    if benchmark != "TPROC-C":
        kind = "unclassified"
    elif kind == "io-intensive":
        if uaw is not True or durability != "full" or not details:
            kind = "unclassified"
    elif kind == "cpu-intensive":
        if uaw is not False or durability not in ("full", "relaxed") or not details:
            kind = "unclassified"
    else:
        kind = "unclassified"

    return {
        "submitted_by": submitter,
        "attribution_source": attribution,
        "submission_pr_url": legacy_info.get("pr_url"),
        "company_name": company.get("name"),
        "company_logo_url": company.get("logo_url"),
        "company_description": company.get("description"),
        "result_description": submission.get("description"),
        "workload_class": kind,
        "workload_uaw": uaw if type(uaw) is bool else None,
        "workload_durability": durability,
        "workload_details": details or None,
        "workload_attribution": "submitter-declared" if kind != "unclassified" else "not supplied",
    }


def _load_rows() -> list[dict]:
    legacy = _legacy_attribution()
    rows: list[dict] = []
    for fp in sorted(RESULTS_ROOT.rglob("*.json")):
        rel = fp.relative_to(REPO_ROOT).as_posix()
        payload = json.loads(fp.read_text(encoding="utf-8"))
        job = payload.get("job") or {}
        cfg = payload.get("benchmark_config") or {}
        res = payload.get("result") or {}
        system = payload.get("system") or {}
        row = {
            "jobid": job.get("jobid"),
            "benchmark": job.get("benchmark"),
            "database": job.get("database"),
            "database_display": job.get("database_display"),
            "release": job.get("release"),
            "timestamp": job.get("timestamp"),
            "hdb_version": job.get("hdb_version"),
            "nopm": res.get("nopm"),
            "tpm": res.get("tpm"),
            "geomean_seconds": res.get("geomean_seconds"),
            "total_query_time_seconds": res.get("total_query_time_seconds"),
            "warehouses": cfg.get("warehouses"),
            "virtual_users": cfg.get("virtual_users"),
            "rampup_minutes": cfg.get("rampup_minutes"),
            "duration_minutes": cfg.get("duration_minutes"),
            "scale_factor": cfg.get("scale_factor"),
            "cpu_model": system.get("cpumodel"),
            "cpu_count": system.get("cpucount"),
            "memory": system.get("memory"),
            "os_name": system.get("os_name"),
            "source_path": rel,
        }
        row.update(_submission_fields(payload, legacy))
        rows.append(row)

    def sort_key(row: dict):
        if row["benchmark"] == "TPROC-H":
            metric = row.get("geomean_seconds")
            return ("TPROC-H", metric is None, metric if isinstance(metric, (int, float)) else float("inf"), row.get("jobid") or "")
        metric = row.get("nopm")
        return (row.get("benchmark") or "", metric is None, -(metric or 0), row.get("jobid") or "")

    rows.sort(key=sort_key)
    rank_by_benchmark: dict[str, int] = {}
    for row in rows:
        benchmark = row.get("benchmark") or "Unknown"
        rank_by_benchmark[benchmark] = rank_by_benchmark.get(benchmark, 0) + 1
        row["rank"] = rank_by_benchmark[benchmark]
    return rows


def _write_json(rows: list[dict]) -> None:
    SITE_ROOT.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "title": "HammerDB Community Benchmark Leaderboard",
        "disclaimer": [
            "Community-submitted HammerDB results",
            "Unaudited; not official TPC benchmark results",
            "CPU- and I/O-focused badges describe submitter-declared configurations, not proven hardware bottlenecks",
        ],
        "rows": rows,
    }
    LEADERBOARD_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    validation = validate_artifacts(REPO_ROOT, RESULTS_ROOT)
    if not validation.ok:
        print(format_validation_failure(validation.errors))
        return 1
    _write_json(_load_rows())
    if not INDEX_HTML.exists():
        # Tests with a temporary repository may intentionally omit the website.
        print("Warning: site/index.html not found; static web interface is not present.")
    print(f"Generated {LEADERBOARD_JSON.relative_to(REPO_ROOT)} with {validation.json_file_count} result(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
