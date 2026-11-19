/* Public endpoint only: no credentials, tokens or private keys belong in this file.
 * Set endpoint to your deployed submission Worker URL in the HammerDB Ltd
 * test branch, and separately when promoting the tested service to TPC Council.
 */
window.HammerDBSubmissionAPI = Object.freeze({
  endpoint: "https://hammerdb-results-submit.hammerdb.workers.dev"
});

// Explicit development senders. Add approved HTTPS deployment origins here;
// never accept a caller-supplied origin or a wildcard.
window.HammerDBSubmissionHandoff = Object.freeze({
  allowedOrigins: Object.freeze([
    "http://localhost:18093", "http://127.0.0.1:18093",
    "http://localhost:18094", "http://127.0.0.1:18094",
    "http://localhost:18194", "http://127.0.0.1:18194"
  ])
});
