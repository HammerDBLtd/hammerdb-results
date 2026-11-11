# HammerDB Results — Development Copy

## Non-negotiable repository roles

- **PUBLICATION REPOSITORY (NO DIRECT PUSH):** [TPC-Council/hammerdb-results](https://github.com/TPC-Council/hammerdb-results), branch `main`.
- **DEVELOPMENT (WRITABLE):** [HammerDBLtd/hammerdb-results](https://github.com/HammerDBLtd/hammerdb-results), branch `master`.
- **Fetching results:** TPC-Council -> HammerDBLtd only; do not automatically mirror development changes or push directly to TPC-Council. **Publication:** contributors may deliberately open a PR to TPC-Council; only TPC maintainers merge it.
- The two repositories are independent repositories, not registered GitHub forks.

## Baseline

The HammerDB Ltd working baseline takes its starting code and accepted results from TPC Council `main` at `879821e56a45079db4aa0031829bb699e571feb8` (11 November 2026).

HammerDB Ltd's previous `master` is preserved in `backup/master-before-tpc-sync-2026-11-11`.

Differences intentionally retained in the development repository:
- `.github/workflows/publish.yml` publishes from `master`, not upstream's `main`.
- `site/repository.js` selects the deployed repository: HammerDB Ltd `master` in development, TPC-Council `main` on its public Pages deployment.
- `DEVELOPMENT.md` documents this read-only upstream arrangement.

## Work only in HammerDB Ltd

```sh
git clone https://github.com/HammerDBLtd/hammerdb-results.git
cd hammerdb-results
git switch master
git pull --ff-only
git switch -c feature/my-change
# Make changes and validate in this repository only
python3 tools/validate_result.py
python3 -m unittest discover -s tests
python3 tools/build_leaderboard.py
git add .
git commit -m "Describe the improvement"
git push -u origin feature/my-change
```

Develop and review code in **HammerDBLtd/hammerdb-results**. When it is deliberately promoted to the public repository, the contributor opens a separate PR to **TPC-Council/hammerdb-results** for TPC maintainer review. Never push directly to TPC.

## Refresh from TPC Council (read-only)

When newer accepted upstream results or fixes are needed:

1. Fetch TPC Council `main` strictly for reading; never push to that remote.
2. Compare its current files against HammerDB Ltd `master`.
3. On a new **HammerDB Ltd** sync branch, import only desired upstream changes while preserving development changes and HammerDB Ltd-specific URLs and workflow branch.
4. Run validation and tests. Integrate the incoming changes in HammerDB Ltd; do not auto-push to TPC.

For local use, configure the upstream remote to block pushing as an additional safeguard:

```sh
git remote add tpc-upstream https://github.com/TPC-Council/hammerdb-results.git
git remote set-url --push tpc-upstream DISABLED
git fetch tpc-upstream main
```

Do not run `git push` against `tpc-upstream`. Never automatically mirror/deploy HammerDB Ltd changes into TPC Council. Promotion to the public repo is an explicit contributor PR and TPC maintainer decision.
