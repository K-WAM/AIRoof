# CANADIAN-DEMO-NUMBER.md — a second demo line for Canadian prospects (T-130)

Written 2026-09-26. Goal: a Canadian local number, answered by the same ElevenLabs agent stack, so a Canadian
prospect calls a number in their own area code instead of the US one. This is additive — the existing US line
(`+1 (689) 204-2643`, tenant `demo-roofing`) is untouched.

**Everything below marked "verify" is a claim about a third-party console, not yet confirmed by clicking through it
in this project — verify before relying on it, per `AGENTS.md`'s rule against fabricating provider behavior.**

## Why this is simpler than the original US line move

The US ElevenLabs migration (`docs/ELEVENLABS-SETUP.md`, `scripts/move-demo-line-to-elevenlabs.mjs`) had to account for
US **A2P 10DLC** registration, which governs *SMS* throughput/trust scoring on US long codes. This platform never
sends SMS (see `CLAUDE.md`'s Known Limitations — SMS is post-MVP, no active seam), and a **voice-only** number, US or
Canadian, does not need A2P/10DLC or CNAM registration at all — that requirement is specific to text messaging.
*(verify: confirm Twilio's current Canadian-voice-number page doesn't list a new requirement since this was written.)*

## Steps

1. **Buy the number (owner, Twilio console).** Console → Phone Numbers → Buy a number → country **Canada** → pick an
   area code (Toronto 416/647, Vancouver 604, Calgary 403, or whichever the target prospect's region is) → Voice
   capability only is enough (no SMS needed) → purchase. *(verify: Twilio may require a Canadian regulatory bundle /
   address for local numbers in some provinces — check the console's own prompts at purchase time; if it asks for an
   end-user or business address, use Luxor's registered address, not a fabricated one.)*
2. **Import it into ElevenLabs (owner, ElevenLabs console).** Same "import a Twilio number" flow already used for the
   US line: ElevenLabs dashboard → Phone Numbers → Import → connect the Twilio number (SID + auth token or Twilio
   API-key credential, whichever the current ElevenLabs UI asks for) → assign it to an agent. *(verify: exact button
   labels — the US import was done by hand in the ElevenLabs console; nothing in this repo automates account-level
   import today. `scripts/setup-elevenlabs-agent.mjs` configures an *existing* agent's tools/webhooks; it does not
   buy or import a number.)*
3. **Decide the tenant mapping — pick one:**
   - **Option A (recommended for a short-lived demo period):** reuse `demo-roofing`'s existing agent, and add the new
     number as a second entry the initiation webhook can resolve. Today `findBusinessByElevenLabsPhoneNumber` looks
     up a business by its single `elevenlabs.phoneNumber` field (`src/lib/vapi/businessLookup.ts`) — a second number
     on the same tenant needs either (a) a small code change to accept an array, or (b) a second Firestore field
     (`elevenlabsPhoneNumberCa`) and a lookup that checks both. Prefer (a) if a THIRD country/number is ever likely;
     otherwise (b) is a smaller, safer diff.
   - **Option B (cleaner isolation):** a dedicated tenant `demo-roofing-ca`, seeded the same way `demo-roofing` is
     (`scripts/seed-demo-business.mjs` as a template), with its own `elevenlabs.phoneNumber`/`agentId`. Demo Studio's
     reset/launch logic (`src/app/api/admin/demo-customize/route.ts`) has a hard-coded allowlist for which business
     ids it's allowed to touch (`LIVE_LINE_BUSINESS_ID` guard) — a second demo tenant needs that allowlist extended
     deliberately, not worked around.
   - Either way: **never** let a Canadian caller's config accidentally serve US-only content (pricing in USD, a US
     phone number in the agent's spoken script, Florida-specific legal notices — this tenant is roofing, not
     Florida-specific, but double-check any hardcoded region strings before the first real call).
4. **Point the webhooks.** The initiation/tools/post-call webhook URLs and `ELEVENLABS_TOOL_SECRET`/
   `ELEVENLABS_WEBHOOK_SECRET` are shared across all numbers/agents on this ElevenLabs account — no per-number secret
   is needed, only the per-number → per-tenant lookup from step 3.
5. **Test call.** Call the new number, run the same 5-call script `docs/DEMO-DAY-RUNBOOK.md` uses for the US line
   (booking, a service question, an off-topic redirect, an emergency escalation), and confirm in the app: no ID read
   aloud, the call and any resulting request appear under the correct tenant, recording/no-recording matches what
   `docs/NEEDS-HUMAN-CHECKLIST.md`'s NH-4 decided.
6. **Update the docs once live:** `HANDOFF.md`'s demo-number line, `docs/DEMO-DAY-RUNBOOK.md`, and
   `public/guides/onboarding-guide.html` if it will be shown to a Canadian prospect during onboarding.

## Owner decisions needed before starting (ask, don't assume)
- Which area code / city to lead with.
- Option A vs Option B above (shared tenant + second number field, or a dedicated `demo-roofing-ca` tenant).
- Whether the Canadian demo should say anything different from the US one (currency, spelling, a Canada-specific
  service area) — if not, Option A with a straight number swap in Demo Studio's "service area" field may be enough
  without touching code at all; confirm this before building anything.
