# TODO: AI Receptionist Platform

> **Stack**: Next.js 15 + TypeScript + Neon (PostgreSQL) + Drizzle ORM + NextAuth.js + Resend + OpenAI + DeepSeek
> **Hosting**: Vercel
> **Superadmin**: connect@luxordev.com

---

## Phase 0: Core Infrastructure ✓
- [x] Type definitions (BusinessConfig, CallSession, Lead, Appointment, AgentAction, etc.)
- [x] Scope classifier (OFF_TOPIC_PATTERNS, ALLOWED_SERVICE_PATTERNS)
- [x] Prompt builder (BuildAgentPrompt from BusinessConfig)
- [x] OpenAI client (generateAgentResponse with fallback)
- [x] DeepSeek client stubs (summarizeTranscript, classifyCallOutcome, generateFaqSuggestions)
- [x] Agent tools interface (checkAvailability, bookAppointment, createLead, escalateCall, logAgentAction)

## Phase 0.5: Firebase → Neon + NextAuth Migration (CURRENT)
- [ ] Set up Neon project and get DATABASE_URL
- [ ] `npm install drizzle-orm @neondatabase/serverless next-auth@beta resend`
- [ ] Write `src/lib/db/schema.ts` — Drizzle table definitions (businesses, calls, leads, appointments, agentActions, users, memberships, etc.)
- [ ] Write `src/lib/db/index.ts` — Neon client + Drizzle instance
- [ ] Write `src/lib/auth.ts` — NextAuth config (Google OAuth + credentials for dev)
- [ ] Write `src/middleware.ts` — Auth guard for /admin/* and /company/*
- [ ] Rewrite `agentTools.ts` — Firestore → Drizzle
- [ ] Rewrite all API routes — Firestore → Drizzle
- [ ] Rewrite `scripts/seed-demo-business.ts` — Firestore → Drizzle
- [ ] Delete `src/lib/firebase/` directory
- [ ] Remove `firebase` and `firebase-admin` from package.json
- [ ] Update `.env.example` — replace Firebase vars with DATABASE_URL, AUTH_SECRET, RESEND_API_KEY
- [ ] Run `npx drizzle-kit push` to create tables in Neon
- [ ] Run seed script to populate demo data
- [ ] Initial push to GitHub (github.com/K-WAM/AIRoof)
- [ ] Connect Vercel project, verify build passes

## Phase 1: Core API Routes (In Progress)
- [x] POST /api/agent/respond — main entry point (classify → prompt → OpenAI → log)
- [x] POST /api/agent/classify — test scope classifier
- [x] GET /api/health — health check
- [x] GET /api/businesses/:businessId/agent-config — retrieve business config
- [x] POST /api/webhooks/twilio/incoming — receive call webhook
- [x] POST /api/webhooks/twilio/transcribe — process transcribed speech
- [x] GET/PUT /api/calls/:callId — get/update call record
- [x] POST /api/tools/execute — execute agent tools
- [x] POST /api/cron/daily-call-summary — daily summaries via DeepSeek
- [x] POST /api/cron/faq-suggestions — analyze calls for FAQ generation
- [x] DELETE /api/calls/:callId — end call (cleanup)

## Phase 2: Testing & Validation
- [ ] Manually test /api/agent/respond (on-topic, off-topic, emergency, FAQ)
- [ ] Verify off-topic requests do NOT trigger OpenAI calls
- [ ] Test /api/agent/classify with all OFF_TOPIC_PATTERNS
- [ ] Test tool execution with /api/tools/execute (all 4 tools)
- [ ] Verify Neon DB records created (calls, leads, appointments, agentActions)
- [ ] Verify multi-tenant isolation (businessId scoping)
- [ ] Run `npx ts-node scripts/seed-demo-business.ts` to populate Neon with demo-roofing

## Phase 3: Admin Dashboard (Basic)
- [x] Create app/admin/layout.tsx (dashboard shell; auth guard pending)
- [x] Create app/admin/onboarding/page.tsx (superadmin onboarding wizard shell)
- [x] Expand superadmin onboarding with template, plan, FAQ/rules, routing, and launch readiness sections
- [x] Add superadmin business creation API for onboarding form submission
- [x] Add superadmin businesses list API for loading tenant records
- [x] Add superadmin business config update API
- [x] Wire superadmin onboarding form to business creation API
- [x] Wire superadmin business config form to config update API
- [x] Add named receptionist fields and easygoing one-question-at-a-time prompt behavior
- [x] Add receptionist name/greeting controls to superadmin onboarding and config forms
- [x] Create app/company/layout.tsx (company user shell; auth guard pending)
- [x] Create app/company/dashboard/page.tsx (calls, leads, escalations, appointments overview)
- [x] Create app/company/leads/page.tsx (lead follow-up queue)
- [x] Create app/company/calls/page.tsx (call history, transcript, summary, agent actions)
- [x] Create app/company/appointments/page.tsx (inspection schedule)
- [x] Create app/company/agent/page.tsx (company-editable agent settings)
- [x] Add FAQ suggestions review section to company agent settings
- [x] Add API route to approve/reject FAQ suggestions and promote approved FAQs
- [x] Add typed per-business integration connection records for calendar, email, SMS, voice, CRM, and notification providers
- [x] Create app/admin/businesses/page.tsx (list all businesses)
- [x] Create app/admin/businesses/[businessId]/config/page.tsx (edit BusinessConfig)
- [x] Add guided superadmin setup controls: industry template selector, plan selector, live model selector, back-office model selector, voice selector, calendar provider selector, phone routing status, launch readiness checklist
- [x] Add vertical templates for roofing first, with placeholders for HVAC, landscaping, dental, and property management
- [x] Add Standard/Subscriber model and voice presets so paid users can get upgraded AI behavior without code changes
- [ ] Create pages/admin/businesses/[businessId]/calls/page.tsx (view call history)
- [ ] Create pages/admin/businesses/[businessId]/leads/page.tsx (view leads)
- [ ] Create pages/admin/businesses/[businessId]/appointments/page.tsx (view appointments)
- [ ] Wire NextAuth auth guard into admin routes
- [ ] Wire NextAuth auth guard into company routes

## Phase 4: Public Pages
- [ ] Create pages/index.tsx (landing page)
- [ ] Create pages/tos.tsx (Terms of Service)
- [ ] Create pages/privacy.tsx (Privacy Policy)
- [ ] Create pages/demo.tsx (demo agent widget)

## Phase 5: Twilio Integration (Real Audio)
- [ ] Wire Twilio SDK for real-time audio transcription
- [ ] Replace Gather/Say stubs with WebSocket for streaming audio
- [ ] Implement call recording storage to Cloud Storage (or Neon large objects)
- [ ] Create webhook signature verification for security
- [ ] Add missed-call text-back workflow
- [ ] Add human handoff / transfer rules for urgent or low-confidence calls
- [ ] Add call recording consent settings per business
- [ ] Document Twilio setup: phone number, webhook URLs, auth token

## Phase 6: Google Calendar Integration
- [ ] Replace mock slots in checkAvailability with real Google Calendar API
- [ ] Wire bookAppointment to create calendar events
- [ ] Handle calendar auth (service account or OAuth2)
- [ ] Add Microsoft Outlook Calendar connector option
- [ ] Add per-business calendar connection status and reconnect flow
- [ ] Add booking confirmation and reschedule/cancel handling
- [ ] Document calendar setup: credentials, sync behavior

## Phase 7: Email/SMS Notifications (Resend + Twilio)
- [ ] Wire escalateCall to send SMS/email notifications
- [ ] Set up Resend for email (replaces SendGrid)
- [ ] Implement Resend React Email templates for booking confirmations, summaries
- [ ] Integrate Twilio SMS for escalation phone
- [ ] Add customer SMS confirmations after booking
- [ ] Add owner/staff email summaries after qualified calls
- [ ] Add follow-up sequences for uncontacted leads
- [ ] Add unsubscribe/do-not-call compliance

## Phase 8: Back-Office Processing (DeepSeek)
- [ ] Wire DeepSeek API for summarizeTranscript
- [ ] Wire DeepSeek API for classifyCallOutcome
- [ ] Wire DeepSeek API for generateFaqSuggestions
- [ ] Create cron jobs for daily processing
- [ ] Store summaries and suggestions in Neon

## Phase 9: Monitoring & Logging
- [ ] Set up Vercel Analytics
- [ ] Add Sentry for error tracking
- [ ] Create logging middleware for call metrics
- [ ] Dashboard: view call success rate, escalation rate, lead conversion
- [ ] Dashboard: missed calls recovered, bookings created, response time, FAQ suggestion rate
- [ ] Add searchable contact records created from calls
- [ ] Add custom intake questions per vertical/business
- [ ] Add low-confidence/flagged-call review queue
- [ ] Alerts: escalation rate > 20%, API errors > 5%

## Phase 10: Multi-Tenant Isolation Audit
- [ ] Code review: all queries scoped by businessId
- [ ] Code review: no hardcoded secrets or IDs
- [ ] Code review: all public endpoints validate caller's business membership
- [ ] Manual test: verify cross-business access is blocked

## Phase 11: Lawns/Landscaping Vertical
- [x] Add generic AI model/voice/tier fields to BusinessConfig so future verticals can share the same platform shape
- [ ] Create landscaping-specific BusinessConfig template
- [ ] Update scope classifier if needed for new services
- [ ] Create demo-landscaping business
- [ ] Document vertical-specific rules (seasonal, emergency types)

## Phase 12: Additional Verticals
- [ ] Dental industry config (appointment scheduling nuances, emergency procedures)
- [ ] HVAC industry config (emergency rules for heating/cooling failures)
- [ ] Property management config (tenant vs owner call handling)
- [ ] Document onboarding process for new verticals

## Optional: Commercial & Enterprise Features
- [ ] Multi-user management per business (roles: owner, staff, viewer)
- [ ] Call transfer to human agents (Twilio agent routing)
- [ ] SMS follow-up sequences (post-appointment reminders)
- [ ] Custom IVR menus per business
- [ ] Callback queuing (no hold music, call them back)
- [ ] Analytics dashboard (call volume, peak hours, best FAQs)
- [ ] A/B testing agent responses
- [ ] CRM integrations: Jobber, ServiceTitan, GoHighLevel, HubSpot, Salesforce
- [ ] Slack/Teams notifications for urgent calls and transfer summaries
- [ ] Website chatbot using the same BusinessConfig constraints
- [ ] Multi-language voice support
- [ ] Integration with QuickBooks for invoice lookup
- [ ] Integration with Calendly for self-service scheduling

## Deployment Checklist
- [x] GitHub repo created (github.com/K-WAM/AIRoof)
- [ ] Initial git push to github.com/K-WAM/AIRoof
- [ ] Set up Vercel project (import from GitHub)
- [ ] Configure Vercel env vars: DATABASE_URL, AUTH_SECRET, OPENAI_API_KEY, RESEND_API_KEY, etc.
- [ ] Custom domain (if applicable)
- [ ] Enable HTTPS and CORS
- [ ] Set up monitoring and alerting
- [ ] Create runbook for on-call support

## Post-Launch
- [ ] Gather user feedback from first roofing customer
- [ ] Measure cost per call (OpenAI + infrastructure)
- [ ] Iterate on scope classifier based on real off-topic patterns
- [ ] Refine prompt builder from call logs
- [ ] Plan paid tier features (white-label, custom branding, advanced analytics)
