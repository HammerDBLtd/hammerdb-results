# HammerDB results: development and production sync

## Repository roles

- **Development:** [HammerDBLtd/hammerdb-results](https://github.com/HammerDBLtd/hammerdb-results), branch `master`.
- **Publication:** [TPC-Council/hammerdb-results](https://github.com/TPC-Council/hammerdb-results), branch `main`.
- These are independent GitHub repositories, **not** forks in the same GitHub network. Cross-repository pull requests between them are not supported as a normal fork workflow.
- Production results are reviewed under TPC Council. Do not copy prototype/test submissions into production or force-push either default branch.

## Development baseline

The working baseline was prepared from TPC Council `main` at commit `879821e56a45079db4aa0031829bb699e571feb8` (checked 11 November 2026). The earlier HammerDB Ltd `master` was preserved at `backup/master-before-tpc-sync-2026-11-11`.

Development-only differences from production are intentional:

1. `.github/workflows/publish.yml` listens on `master` here, versus `main` in TPC Council.
2. `site/submit.html` targets `HammerDBLtd/hammerdb-results` and `master` here, versus `TPC-Council/hammerdb-results` and `main` in production.
3. This documentation file lives only in the development repository.

## Work in HammerDB Ltd

```sh
git clone https://github.com/HammerDBLtd/hammerdb-results.git
cd hammerdb-results
git switch master
git pull --ff-only
git switch -c feature/my-change

# Make edits, then validate:
python3 tools/validate_result.py
python3 -m unittest discover -s tests
python3 tools/build_leaderboard.py

git add .
git commit -m "Describe the improvement"
git push -u origin feature/my-change
```

Open a pull request to HammerDB Ltd `master` for review and testing. Generated `site/index.html` and `site/leaderboard.json` are refreshed by the Pages build; review generated changes if included in a commit.

## Promote reviewed code to TPC Council

Promotion is **manual and review-gated**, not a one-way repository mirror:

1. Start a release branch based on the **latest TPC Council `main`**, so new accepted benchmark submissions are preserved.
2. Copy/cherry-pick **only the reviewed feature commits** from HammerDB Ltd, not the development-baseline snapshot or prototype results. Because the GitHub repositories are independent, use local Git remotes, patches, or cherry-picks to transfer the code.
3. Keep production-specific configuration: `publish.yml` targets `main`; `submit.html` targets `TPC-Council/hammerdb-results` and `main`.
4. Run validation and tests, open a pull request against TPC Council `main`, and let TPC maintainers review and merge.

For example, with a checked-out clone of TPC Council and a local HammerDB Ltd remote:

```sh
git remote add hammerdb-dev https://github.com/HammerDBLtd/hammerdb-results.git
git fetch origin
git fetch hammerdb-dev
git switch -c release/my-change origin/main
git cherry-pick <approved-feature-commit-sha>
# Check environment-specific URLs and workflow branch, validate, then push to
# your permitted TPC Council branch/fork and open a PR to main.
```

## Refreshing the development baseline

TPC Council may receive submissions independently. Before major work or release, compare TPC Council `main` against HammerDB Ltd `master`, selectively bring in new **approved** result artifacts and code changes, and review the diff. Do not overwrite new development work or remove production results through automatic full mirroring.
