# TODO: AI Receptionist Platform

> **Stack**: Next.js 15 + TypeScript + Firebase (Auth + Firestore) + OpenAI + DeepSeek + Twilio + Resend
> **Hosting**: Vercel
> **Firebase**: Add airoof web app to an existing Firebase project (no new project needed)
> **Superadmin**: connect@luxordev.com

---

## Phase 0: Firebase Project Setup (CURRENT)
- [ ] Open Firebase Console → open existing project → ⚙️ Project settings → "Add app" → Web (`</>`)
- [ ] Nickname the app "airoof" and register it
- [ ] Copy the Firebase config object into `.env` (see `.env.example` for field names)
- [ ] Download service account key: ⚙️ → Service accounts → "Generate new private key" → paste JSON string into `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env`
- [ ] Enable Auth providers: Authentication → Sign-in method → Enable Google (or desired providers)
- [ ] Add Vercel domain (e.g., `ai-roof.vercel.app`) to Authentication → Settings → Authorized domains
- [ ] Add `.env` to `.gitignore` (already done — API keys and service account JSON must never be committed)
- [ ] Initial push to GitHub (github.com/K-WAM/AIRoof) — already done ✓
- [ ] Connect Vercel project to GitHub repo
- [ ] Configure Vercel env vars from `.env`

## Phase 1: Core Infrastructure ✓
- [x] Type definitions (BusinessConfig, CallSession, Lead, Appointment, AgentAction, etc.)
- [x] Firebase client SDK module (browser-safe)
- [x] Firebase admin SDK module (server-side token verification)
- [x] Scope classifier (OFF_TOPIC_PATTERNS, ALLOWED_SERVICE_PATTERNS)
- [x] Prompt builder (BuildAgentPrompt from BusinessConfig)
- [x] OpenAI client (generateAgentResponse with fallback)
- [x] DeepSeek client stubs (summarizeTranscript, classifyCallOutcome, generateFaqSuggestions)
- [x] Agent tools interface (checkAvailability, bookAppointment, createLead, escalateCall, logAgentAction)

## Phase 2: Core API Routes ✓
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

## Phase 3: Demo Data, Testing & Admin Docs ✓ (seed + test remaining)
- [x] Create demo-roofing business seed script
- [x] Create TESTING.md with comprehensive test cases
- [x] Create docs/ADMIN-ONBOARDING.md (full business onboarding workflow)
- [x] Create docs/ADMIN-QUICK-START.md (fast reference checklist)
- [ ] Run seed-demo-business.ts to populate Firestore with demo-roofing
- [ ] Manually test /api/agent/respond (on-topic, off-topic, emergency, FAQ)
- [ ] Verify off-topic requests do NOT trigger OpenAI calls
- [ ] Test /api/agent/classify with all OFF_TOPIC_PATTERNS
- [ ] Test tool execution with /api/tools/execute (all 4 tools)
- [ ] Verify Firestore documents created (calls, leads, appointments, agentActions)
- [ ] Verify multi-tenant isolation (businessId scoping)

## Phase 4: Firestore Security Rules
- [x] Write security rules preventing cross-business data access
- [ ] Deploy rules: `firebase deploy --only firestore:rules`
- [ ] Test rules: authorized reads on own business, rejected reads on other business

## Phase 5: Admin Dashboard (Basic)
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
- [ ] Add Firebase Auth check to admin routes
- [ ] Add Firebase Auth check to company routes

## Phase 6: Public Pages
- [ ] Create pages/index.tsx (landing page)
- [ ] Create pages/tos.tsx (Terms of Service)
- [ ] Create pages/privacy.tsx (Privacy Policy)
- [ ] Create pages/demo.tsx (demo agent widget)

## Phase 7: Twilio Integration (Real Audio)
- [ ] Wire Twilio SDK for real-time audio transcription
- [ ] Replace Gather/Say stubs with WebSocket for streaming audio
- [ ] Implement call recording storage to Cloud Storage
- [ ] Create webhook signature verification for security
- [ ] Add missed-call text-back workflow
- [ ] Add human handoff / transfer rules for urgent or low-confidence calls
- [ ] Add call recording consent settings per business
- [ ] Document Twilio setup: phone number, webhook URLs, auth token

## Phase 8: Google Calendar Integration
- [ ] Replace mock slots in checkAvailability with real Google Calendar API
- [ ] Wire bookAppointment to create calendar events
- [ ] Handle calendar auth (service account or OAuth2)
- [ ] Add Microsoft Outlook Calendar connector option
- [ ] Add per-business calendar connection status and reconnect flow
- [ ] Add booking confirmation and reschedule/cancel handling
- [ ] Document calendar setup: credentials, sync behavior

## Phase 9: Email/SMS Notifications (Resend + Twilio)
- [ ] Wire escalateCall to send SMS/email notifications
- [ ] Set up Resend for email (sign up at resend.com, get API key)
- [ ] Implement Resend React Email templates for booking confirmations, daily summaries, escalation alerts
- [ ] Integrate Twilio SMS for escalation phone
- [ ] Add customer SMS confirmations after booking
- [ ] Add owner/staff email summaries after qualified calls
- [ ] Add follow-up sequences for uncontacted leads
- [ ] Add unsubscribe/do-not-call compliance

## Phase 10: Back-Office Processing (DeepSeek)
- [ ] Wire DeepSeek API for summarizeTranscript
- [ ] Wire DeepSeek API for classifyCallOutcome
- [ ] Wire DeepSeek API for generateFaqSuggestions
- [ ] Create cron jobs for daily processing
- [ ] Store summaries and suggestions in Firestore

## Phase 11: Monitoring & Logging
- [ ] Set up Vercel Analytics
- [ ] Add Sentry for error tracking
- [ ] Create logging middleware for call metrics
- [ ] Dashboard: view call success rate, escalation rate, lead conversion
- [ ] Dashboard: missed calls recovered, bookings created, response time, FAQ suggestion rate
- [ ] Add searchable contact records created from calls
- [ ] Add custom intake questions per vertical/business
- [ ] Add low-confidence/flagged-call review queue
- [ ] Alerts: escalation rate > 20%, API errors > 5%

## Phase 12: Multi-Tenant Isolation Audit
- [ ] Code review: all queries scoped by businessId
- [ ] Code review: no hardcoded secrets or IDs
- [ ] Code review: all public endpoints validate caller's business membership
- [ ] Manual test: verify cross-business access is blocked

## Phase 13: Lawns/Landscaping Vertical
- [x] Add generic AI model/voice/tier fields to BusinessConfig so future verticals can share the same platform shape
- [ ] Create landscaping-specific BusinessConfig template
- [ ] Update scope classifier if needed for new services
- [ ] Create demo-landscaping business
- [ ] Document vertical-specific rules (seasonal, emergency types)

## Phase 14: Additional Verticals
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
- [x] Initial git push to GitHub
- [ ] Add airoof web app to existing Firebase project and configure `.env`
- [ ] Set up Vercel project (import from GitHub)
- [ ] Configure Vercel env vars: OPENAI_API_KEY, FIREBASE_SERVICE_ACCOUNT_JSON, etc.
- [ ] Deploy Firebase Firestore rules
- [ ] Deploy Cloud Functions for cron jobs
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
