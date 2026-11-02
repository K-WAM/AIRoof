# Offline field support (T-242)

The already-loaded app can keep previously fetched calendar/jobs data visible and retain field submissions through a signal outage. No service worker or new paid service is introduced. `fake-indexeddb` is a development-only test dependency.

## What the worker sees

1. Open the calendar or job while connected. Successful allowlisted JSON reads are saved in IndexedDB under the signed-in uid and exact URL, including range parameters.
2. When a read loses its connection, its saved response is returned with `x-luxor-offline: <savedAt>`. The global banner gives the saved-data time. A new date range or job that has never been fetched has no offline copy.
3. Type a note, finish a recording, save a photo, or tap the time clock. The full request and its client request ID are committed to IndexedDB before the upload starts. Audio also retains the original Blob. The field page says “Saved on this phone — will send when you have signal (N)”.
4. With the app open, waiting entries retry on reconnect, focus and a shared 30-second timer, subject to exponential backoff up to five minutes. Entries are sent in creation order; a later punch cannot overtake an unresolved one. A delayed punch uses the original captured time.
5. A confirmed response changes that entry to “Sent ✓”. An invalid/empty success response never discards its phone copy. A proposed correction still requires explicit confirmation or cancellation. A rejection remains available with “Keep on this phone” and “Delete”.
6. Office writes outside this outbox fail with “Offline — your change was not saved. Try again when you have signal.” They are not silently queued. Online superadmin previews keep their existing write flow but never persist preview data in the outbox or read cache.

If phone storage fails, typed text and the photo form remain open. The recording stays in memory with a “Retry saving recording” action; a new recording cannot overwrite it. Keep that page open until it is saved.

## Isolation and duplicate protection

- The common Firebase sign-out observer clears only the departing uid's read cache. Pending outbox entries are deliberately retained for that same uid's next sign-in; signing out must not destroy unsent work. Queue deletion helpers take a uid and only delete matching entries.
- A signed-in queue is checked against the current Firebase uid before replay. Every queued request also carries a non-authorizing owner marker, checked **after** the existing server access gate. A different login cannot submit the old queue. Existing auth, role, business and QR guards remain authoritative.
- Anonymous QR queues are bound to a SHA-256 fingerprint of the exact HttpOnly field session, never its token. Expired/revoked/replaced QR access cannot silently rebind old entries to another session. Those entries remain on the phone for office review.
- The read cache excludes admin endpoints, exports, other job subroutes, other tenants, other origins and superadmin previews. HTTP auth/server errors and aborted reads do not fall back to stale data. Cache-Control policies and the CSP configuration are unchanged.
- Updates, field-audio, photos and punches accept optional `clientRequestId`. A transaction claims a tenant/operation/job/author key before any AI or ledger work. Completed requests replay the original status and JSON without invoking the paid work again. Reusing a key with different data is refused.
- Completed receipts carry a 90-day `expiresAt` field. No live Firestore TTL policy is enabled by this change. Device submissions older than 30 days are retained as a rejection requiring office review, rather than being silently applied with stale timing.

## Deliberate limits and follow-up verification

- **No offline reload or first visit.** IndexedDB responses cannot load the Next.js page shell or missing JavaScript chunks. This supports an already-loaded/warmed app; a cold reload with no signal still needs a service worker.
- **CSP nonce trade-off.** Middleware supplies a fresh script nonce per request and the root layout stays `force-dynamic`. Caching/replaying page HTML requires a separate design that keeps its CSP header and script nonces consistent. This task does not add a service worker, `force-static`, `generateStaticParams`, or weaken the CSP.
- **No upload while the app is closed.** Background Sync is not installed. Reopen the app with signal to resume. Browser/OS storage eviction, clearing site data and phone loss can still remove local data; IndexedDB is not a remote backup.
- **A server error never sticks; an interrupted claim expires.** A 5xx/429/408 from the route (these return before anything is written: database unavailable, transcription failed) releases the claim, so the phone's next retry runs the work again. A claim left pending by a run that died (e.g. a function timeout) is taken over after 10 minutes (`STALE_PENDING_MS`, far beyond the 60 s maxDuration). Rare cost: if the dead run had already written, the office may see that note twice and pay one extra ~1¢ parse — chosen over a note that waits forever.
- **Still unproven on hardware:** airplane-mode transitions, mobile microphone/photo capture, browser eviction/private-storage behavior, multiple real tabs, expired QR recovery, and the production Firebase/OpenAI path. The integrator owns the browser harness and phone screenshots; this worker does not run Playwright or the harness.

Vitest coverage uses fake IndexedDB, mocked provider edges and the existing transactional Firestore fake. It covers durable audio retention, queue isolation, storage failure, backoff/order, reconnect/focus/timer triggers, explicit corrections, cache allowlisting and sign-out races. Tests also invoke all four real route handlers to check one record/model call for duplicate IDs and separate records for different IDs. The final handoff records the TypeScript, changed-file ESLint, related/API/full Vitest and Next build results.
