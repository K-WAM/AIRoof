# Data retention and call redaction

Status: implemented with conservative defaults; owner/legal sign-off is still required under NH-4.

## Repository-enforced policy

The application redacts three categories independently. Each defaults to 90 days and can be configured with an integer from 1 to 3650 days:

| Category | Configuration | Redacted data |
|---|---|---|
| Call transcripts | `RETENTION_TRANSCRIPTS_DAYS` | `messages`, raw `transcript`, summary, and outcome-reason text |
| Call recordings | `RETENTION_RECORDINGS_DAYS` | `recordingUrl` |
| Tool I/O logs | `RETENTION_TOOL_IO_DAYS` | `input` and `output` on tenant `agentActions` |

The 90-day values are implementation defaults, not an approved legal policy. NH-4 remains open until the owner and legal counsel approve the windows and related disclosure/deletion obligations.

Redaction deletes the sensitive Firestore fields. In their place, a retention skeleton records only each removed field's SHA-256 hash and serialized byte length, plus the redaction timestamp. The skeleton does not retain transcript text, recording URLs, tool inputs/outputs, or caller identifiers.

Financial records are outside this job. The implementation queries only `businesses/{businessId}/calls` and `businesses/{businessId}/agentActions`; it never queries or deletes invoices.

## Retention cron

Invoke `POST /api/cron/retention` with `Authorization: Bearer <CRON_SECRET>` and JSON:

```json
{
  "businessId": "tenant-id",
  "batchSize": 100,
  "cursor": "optional cursor returned by the preceding batch"
}
```

Authentication runs before any Firestore read or write. `businessId` is required to keep every run tenant-scoped. `batchSize` defaults to 100 and is capped at 250.

The response includes `nextCursor`. Continue invoking the endpoint with that cursor until it returns `null`. Calls and tool actions are processed in individual transactions, so a partially completed batch can be retried safely. Reusing an earlier cursor may scan records again, but already-redacted fields are unchanged and do not produce another successful redaction event. Calls with `status: "active"` are always skipped, even if their timestamps are malformed or old.

## `DELETE /api/calls/[callId]`

DELETE is a redaction operation, not a physical removal of the audit record and not a shortcut for ending a call.

- An active call returns `409`, is not changed, and records a privacy-safe denied audit event.
- An ended/non-active call has transcript content, recording URLs, transcript-derived text, and call-local caller identifiers removed immediately.
- Operational/audit fields such as the call ID, tenant ID, provider call ID, status, timestamps, cost, and non-PII outcome code remain.
- Hash/length skeletons and an immutable `call.delete` audit event prove what categories were removed without retaining their contents.
- Repeating DELETE is idempotent: it succeeds with `redacted: false` and appends a `skipped` audit event rather than restoring or duplicating sensitive data.

This endpoint redacts the call artifact only. It is not data-subject-request tooling and does not traverse separate lead, appointment, invoice, or provider systems.

## Audit integrity

Privacy audit events are stored at `businesses/{businessId}/auditEvents/{eventId}`. The repository exposes readonly event types and writes events with Firestore transaction `create` semantics; an existing event ID cannot be overwritten. Every event records:

- correlation ID;
- actor and action;
- subject and timestamp;
- success, failure, denial, or skipped result;
- available provider IDs (for example Vapi call/tool-call IDs);
- privacy-safe result codes or hash/length skeletons only.

Vapi appointment lookup and cancellation now use distinct `appointment.lookup` and `appointment.cancel` actions. Their audit details omit caller-supplied parameters and human-readable provider output.
