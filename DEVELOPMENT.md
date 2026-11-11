# HammerDB Results — Development Copy

## Non-negotiable repository roles

- **UPSTREAM (READ-ONLY):** [TPC-Council/hammerdb-results](https://github.com/TPC-Council/hammerdb-results), branch `main`.
- **DEVELOPMENT (WRITABLE):** [HammerDBLtd/hammerdb-results](https://github.com/HammerDBLtd/hammerdb-results), branch `master`.
- **Synchronization direction: TPC-Council -> HammerDBLtd only.** Never push, create a pull request, or modify files, settings, branches, or Actions in the TPC-Council repository.
- The two repositories are independent repositories, not registered GitHub forks.

## Baseline

The HammerDB Ltd working baseline takes its starting code and accepted results from TPC Council `main` at `879821e56a45079db4aa0031829bb699e571feb8` (11 November 2026).

HammerDB Ltd's previous `master` is preserved in `backup/master-before-tpc-sync-2026-11-11`.

Differences intentionally retained in the development repository:
- `.github/workflows/publish.yml` publishes from `master`, not upstream's `main`.
- `site/submit.html` targets `HammerDBLtd/hammerdb-results` on `master`, not TPC Council.
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

Open pull requests **only to HammerDBLtd/hammerdb-results** and merge approved changes to its `master`.

## Refresh from TPC Council (read-only)

When newer accepted upstream results or fixes are needed:

1. Fetch TPC Council `main` strictly for reading; never push to that remote.
2. Compare its current files against HammerDB Ltd `master`.
3. On a new **HammerDB Ltd** sync branch, import only desired upstream changes while preserving development changes and HammerDB Ltd-specific URLs and workflow branch.
4. Run validation and tests. Open and merge a pull request **in HammerDB Ltd only**.

For local use, configure the upstream remote to block pushing as an additional safeguard:

```sh
git remote add tpc-upstream https://github.com/TPC-Council/hammerdb-results.git
git remote set-url --push tpc-upstream DISABLED
git fetch tpc-upstream main
```

Do not run `git push` against `tpc-upstream`. Never automatically mirror/deploy HammerDB Ltd changes into TPC Council. Production is entirely outside our development workflow.
