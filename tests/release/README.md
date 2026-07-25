# Deterministic release suite

Run the release gate from the repository root:

```powershell
npx vitest run --config tests/release/vitest.config.ts
```

The suite imports real route handlers and sends real `NextRequest` objects through
them. Firestore is an in-memory transactional fake, and Vapi, Resend, OpenAI, and
DeepSeek are mocked only at their existing provider seams. No test may use the
network, provider credentials, browser automation, wall-clock waits, or production
data.

## Flaky-test quarantine policy

This required suite runs files sequentially, caps in-file concurrency at one, uses
fixed inputs, and has retries disabled. A release-test failure therefore blocks the
merge. First reproduce the failure in isolation and then rerun this suite once to
distinguish a code defect from the repository's known machine-load timeout pattern.
Do not skip, `.only`, or silently retry a flaky release test.

Temporary quarantine requires an owner-approved tracking issue with the failing
test name, reproduction evidence, an assignee, and an expiry date. The quarantined
test must remain visible in a separate non-required job until fixed; the required
release suite may not be declared green by hiding an unexplained failure.

## Owner setup: require CI on `main`

The current tracker calls this console action **NH-7**. In the GitHub repository:

1. Open **Settings → Rules → Rulesets** (or the existing `main` branch protection
   rule) and create/edit a rule targeting `main`.
2. Require a pull request before merging and require status checks to pass.
3. Select the status check named **CI / gate** after it has appeared on a pull
   request. This job includes both the normal unit suite and this release suite.
4. Enable “require branches to be up to date before merging” if the team wants the
   merge commit tested against the latest `main`, and do not allow routine bypasses.
5. Save the rule, then confirm a test pull request cannot merge while **CI / gate**
   is pending or failing and can merge once it is green.

This repository setting is intentionally not changed by the worker branch.
