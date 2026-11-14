# One-click HammerDB result submission (test environment)

This service replaces all fork/name/copy-JSON UI with **one Submit result button**.
It is intentionally not yet enabled on the published HammerDB Ltd page: the
GitHub App and Worker must be configured and an end-to-end PR test must pass.
Never promote an unconfigured service to TPC-Council.

## User journey

1. Upload the result JSON and fill in the existing form.
2. Click **Submit result** once.
3. If required, sign in to GitHub and approve the submission app.
4. The service uses the authenticated GitHub username, creates a branch and
   canonical result JSON in the **maintainer repository**, opens a PR and
   redirects the browser directly to that PR.
5. Maintainer reviews/merges, then the leaderboard publishes.

No contributor forks, repo names, manual JSON copies or temporary GitHub tokens.

## Operator setup: HammerDB Ltd test only

1. Create a **GitHub App**, restricted to the
   `HammerDBLtd/hammerdb-results` repository, with these repository
   permissions: Contents **read/write** and Pull requests **read/write**;
   Metadata read (automatic). Enable web-flow user authorization and use the
   Worker `https://<your-worker-domain>/oauth/callback` as an OAuth callback URL.
2. Deploy `service/worker.mjs` as a Cloudflare Worker. Create a KV namespace
   named `PENDING` with Wrangler, put its namespace ID in `wrangler.toml`,
   and set these **Worker secrets** (not repository files or Pages settings):
   `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`,
   `GITHUB_APP_PRIVATE_KEY`. The private key can be GitHub's normal
   `BEGIN RSA PRIVATE KEY` format. **Never commit secrets.**
3. Set the GitHub Actions repository variable
   `SUBMISSION_APP_BOT_LOGIN` to the exact bot login, e.g.
   `hammerdb-submit[bot]`. Validation must verify that bot-submitted PRs
   came from a same-repo `submission/` branch.
4. Confirm `GET /health` shows `configured:true`. Configure
   `site/submission-service-config.js` with the deployed public Worker
   endpoint (URL only; no tokens).
5. Run `node --test service/worker.test.mjs tests/test_submit_form.cjs`,
   the existing Python validation and a real browser submission. Verify the
   PR is created in **HammerDBLtd**, never in TPC-Council, before merging
   the frontend branch. Do not merge a synthetic benchmark into published
   results.

## Safety properties

- The GitHub App's installation token is used server-side to write only to
  `GITHUB_TARGET_OWNER/GITHUB_TARGET_REPO`. A browser cannot choose another
  target. The OAuth callback verifies the contributor's actual GitHub login
  before writing.
- POST origin is limited to `ALLOWED_ORIGIN`. Draft JSON is held for no
  more than 15 minutes in private Cloudflare KV, not exposed in a URL.
- Result path is canonicalized; duplicate paths are blocked. Validation CI
  remains the approval gate; no automatic merge.
- New app-created PRs need the explicit bot login in Actions configuration.
  All older human-authored PRs still use the existing attribution comparison.
- Production migration: deploy a **separate** service/configuration restricted
  to `TPC-Council/hammerdb-results`, after independent test and permission.

GitHub App OAuth requires users to sign in or authorize the app once, if they
have not already done so. This is a GitHub security requirement, not a
multi-step fork workflow.

The worker is code-complete but **not deployable without a real GitHub App
and Cloudflare Worker account**, which are external operator prerequisites.
