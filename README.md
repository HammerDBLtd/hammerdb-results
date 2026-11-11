# HammerDB Community Benchmark Results

This is the **HammerDB Ltd development copy** of [TPC-Council/hammerdb-results](https://github.com/TPC-Council/hammerdb-results). **TPC-Council is strictly READ-ONLY. Never push, open a pull request, or publish changes there.** All development and testing happen in `HammerDBLtd/hammerdb-results`, with one-way imports from TPC-Council when needed.

## Leaderboard

The modernised leaderboard has dark/light themes, gradient performance cards, a search and filters, TPROC-C NOPM/TPM, TPROC-H query-time results, system configuration and a detailed report for every result.

Every result identifies the GitHub submitter where provenance is known. For the existing upstream submissions, original accepted pull requests are recorded in `submissions/legacy-attribution.json`. Future submissions may include company name, HTTPS logo URL, company description and a narrative about the test.

## Submit an artifact

Use `site/submit.html` (or its GitHub Pages deployment). A pipeline is **not** required.

1. Save a HammerDB JSON result artifact from the GUI, CLI or Web Service, or provide its `artifact_url` to the submission page.
2. Upload the artifact; the submission form validates its required fields and the canonical result path.
3. Enter the GitHub username that will open the pull request. Optionally add company name, logo URL, company description and a description of the benchmark.
4. For TPROC-C, record UAW and durability options, with configuration details, or leave the workload *Not classified*.
5. Copy the enriched JSON and use the GitHub new-file editor to create `results/<benchmark>/<database>/<year>/<month>/<jobid>.json` **in HammerDB Ltd**. Commit and open a pull request.

The submission flow preserves the original result fields (`job`, `benchmark_config`, `system`, metrics, charts and measurements). It adds a separate, optional top-level `submission` object. Older result artifacts without this metadata continue to validate and render.

The GitHub Actions PR validation checks new result artifacts' declared GitHub username against the authenticated PR author. Imports of already accepted upstream artifacts can instead cite the verified original PR in the legacy attribution map.

## TPROC-C CPU/I/O classification

**Labels describe the test configuration declared by the submitter, not a proven physical bottleneck.** IOPS, MB/s and CPU utilisation alone do not establish the classification.

| Display label | Requirements |
| --- | --- |
| I/O-focused | Use All Warehouses (UAW) enabled, full/synchronous database durability, and written configuration explanation |
| CPU-focused | UAW disabled, durability declared as full or relaxed, and written explanation of the CPU-focused setup |
| Not classified | Missing, uncertain or insufficient configuration evidence; default for existing results |

The artifact is the benchmark record. The form asks for missing UAW/durability evidence because older artifacts often have only the basic workload settings. A pipeline-specific configuration file is **not** mandatory. A declaration conflicting with an explicit UAW value in `benchmark_config` fails validation.

Useful details include database settings such as `innodb_flush_log_at_trx_commit`, `sync_binlog`, `synchronous_commit`, SQL Server delayed durability, storage and buffer-cache sizing, and observed wait/latency behaviour. See [HammerDB's UAW documentation](https://www.hammerdb.com/docs/ch04s08.html).

## Build and test

From the repository root:

```sh
python3 tools/validate_result.py
python3 -m unittest discover -s tests -v
python3 tools/build_leaderboard.py
```

`tools/build_leaderboard.py` updates `site/leaderboard.json` from source artifacts and provenance metadata; the frontend in `site/index.html`, `site/leaderboard.css` and `site/leaderboard.js` renders the results. GitHub Pages uses HammerDB Ltd `master`.

Community results are **user-submitted, unaudited and not official TPC benchmark results**.

## License

Apache License, Version 2.0; see `LICENSE`.
