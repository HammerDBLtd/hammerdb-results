from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import build_leaderboard  # noqa: E402
from result_validation import canonical_result_path, validate_artifacts  # noqa: E402


def sample_result(*, jobid="SUBMIT123") -> dict:
    return {
        "schema": "hammerdb-job-report-v1",
        "disclaimer": {"audited": False},
        "job": {
            "jobid": jobid, "hdb_version": "v6.0",
            "database": "MariaDB", "database_display": "MariaDB",
            "benchmark": "TPROC-C", "timestamp": "2026-11-10 12:34:56",
            "release": "12.3.3",
        },
        "benchmark_config": {
            "warehouses": 1000, "virtual_users": 48,
            "rampup_minutes": 2, "duration_minutes": 5,
        },
        "result": {"nopm": 800000, "tpm": 1700000},
        "system": {"cpumodel": "Example CPU", "memory": "128 GB"},
    }


class SubmissionMetadataTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.results = self.root / "results"
        self.results.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def save(self, payload):
        rel = canonical_result_path(payload["job"])
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")

    def check(self):
        return validate_artifacts(self.root, self.results).errors

    def test_legacy_unannotated_artifacts_remain_valid(self):
        self.save(sample_result())
        self.assertEqual([], self.check())

    def test_valid_io_focused_submission(self):
        artifact = sample_result()
        artifact["submission"] = {
            "github_username": "benchmark-user",
            "description": "A storage-heavy MariaDB benchmark.",
            "company": {
                "name": "ExampleDB",
                "logo_url": "https://example.org/logo.png",
                "description": "Database engineering",
            },
            "workload": {
                "classification": "io-intensive",
                "use_all_warehouses": True,
                "durability": "full",
                "details": "Use All Warehouses enabled; durability and transaction logging enabled.",
            },
        }
        self.save(artifact)
        self.assertEqual([], self.check())

    def test_bad_io_focused_claim_is_rejected(self):
        artifact = sample_result()
        artifact["submission"] = {
            "github_username": "some-user",
            "workload": {
                "classification": "io-intensive",
                "use_all_warehouses": False,
                "durability": "relaxed",
                "details": "Claimed I/O heavy but UAW and durability are not enabled.",
            },
        }
        self.save(artifact)
        self.assertIn("I/O-focused classification requires UAW enabled and full durability", "\n".join(self.check()))

    def test_cpu_focused_submission_requires_evidence(self):
        artifact = sample_result()
        artifact["submission"] = {
            "github_username": "some-user",
            "workload": {
                "classification": "cpu-intensive",
                "use_all_warehouses": False,
                "durability": "relaxed",
                "details": "Storage waits reduced using asynchronous commit with UAW disabled.",
            },
        }
        self.save(artifact)
        self.assertEqual([], self.check())
        artifact["submission"]["workload"]["details"] = ""
        self.save(artifact)
        self.assertIn("configuration evidence", "\n".join(self.check()))

    def test_artifact_uaw_conflict_is_rejected(self):
        artifact = sample_result()
        artifact["benchmark_config"]["use_all_warehouses"] = True
        artifact["submission"] = {
            "github_username": "some-user",
            "workload": {
                "classification": "cpu-intensive",
                "use_all_warehouses": False,
                "durability": "full",
                "details": "CPU-focused configuration with verified explicit UAW value.",
            },
        }
        self.save(artifact)
        self.assertIn("declared UAW conflicts", "\n".join(self.check()))

    def test_untrusted_logo_url_and_invalid_account_are_rejected(self):
        artifact = sample_result()
        artifact["submission"] = {
            "github_username": "bad user !",
            "company": {"name": "Example", "logo_url": "javascript:alert(1)"},
        }
        self.save(artifact)
        messages = "\n".join(self.check())
        self.assertIn("valid GitHub username", messages)
        self.assertIn("public HTTPS URL", messages)

    def test_builder_preserves_legacy_attribution_and_does_not_guess_profile(self):
        self.save(sample_result())
        att = self.root / "submissions"
        att.mkdir()
        (att / "legacy-attribution.json").write_text(
            json.dumps({"SUBMIT123": {"github_username": "original-pr-user",
                                      "pr_url": "https://github.com/example/repo/pull/123"}}),
            encoding="utf-8",
        )
        previous = {name: getattr(build_leaderboard, name) for name in
                    ("REPO_ROOT", "RESULTS_ROOT", "SITE_ROOT", "LEADERBOARD_JSON", "INDEX_HTML")}
        try:
            build_leaderboard.REPO_ROOT = self.root
            build_leaderboard.RESULTS_ROOT = self.results
            build_leaderboard.SITE_ROOT = self.root / "site"
            build_leaderboard.LEADERBOARD_JSON = self.root / "site" / "leaderboard.json"
            build_leaderboard.INDEX_HTML = self.root / "site" / "index.html"
            self.assertEqual(0, build_leaderboard.main())
            row = json.loads(build_leaderboard.LEADERBOARD_JSON.read_text())["rows"][0]
            self.assertEqual("original-pr-user", row["submitted_by"])
            self.assertEqual("original-pr", row["attribution_source"])
            self.assertEqual("unclassified", row["workload_class"])
        finally:
            for name, value in previous.items():
                setattr(build_leaderboard, name, value)


if __name__ == "__main__":
    unittest.main()
