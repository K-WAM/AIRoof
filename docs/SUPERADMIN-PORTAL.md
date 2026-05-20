# Superadmin Portal Plan

The portal exists to onboard and monitor service businesses without editing Firestore by hand.

## Primary Users

- Superadmin: `connect@luxordev.com`; creates businesses, controls launch readiness, manages integrations, reviews tenant isolation.
- Business owner: reviews calls, leads, appointments, FAQs, and escalation settings for their own business.
- Staff: handles leads, appointments, and call follow-up for one business.
- Viewer: read-only access for one business.

## Roofing Company Jobs To Be Done

Roofing companies need the agent to:

- Answer every call immediately, including after hours and storm spikes.
- Separate emergencies from routine estimate requests.
- Capture caller name, phone, address, service type, roof issue, urgency, and preferred time.
- Book inspections or create leads with enough context for fast follow-up.
- Escalate active leaks, water entry, storm damage, electrical hazards, and safety risks.
- Avoid unauthorized topics such as detailed pricing, insurance advice, financing terms, legal advice, or structural engineering advice.
- Send a concise summary to the business after every meaningful call.

## Required Company Configuration

Business profile:

- Business ID, name, industry, active status.
- Main phone number, service area, hours.
- Escalation phone and notification email.

Agent rules:

- Approved services.
- Approved FAQs with exact answers.
- Emergency rules.
- Booking rules.
- Disallowed topics.
- Agent tone and voice.
- Receptionist name, role, greeting, and after-hours greeting.
- Plan tier, AI provider, live call model, back-office model, temperature, and response token limit.

Routing and integrations:

- Twilio phone mapping.
- Calendar provider.
- OpenAI, DeepSeek, email, and SMS status.

Access:

- `businessUsers/{uid}` membership with `businessId`, role, active status.
- Superadmin access via Firebase custom claim: `superadmin: true`.

Company users only access their assigned business. They use a smaller operations UI for calls, leads, appointments, approved agent settings, and follow-up work.

## Firestore Collections

```text
businesses/{businessId}
businesses/{businessId}/calls/{callId}
businesses/{businessId}/leads/{leadId}
businesses/{businessId}/appointments/{appointmentId}
businesses/{businessId}/agentActions/{actionId}

businessUsers/{uid}
businessPhoneNumbers/{phoneNumberId}
businessOnboarding/{businessId}
businessIntegrationStatus/{businessId}
businessIntegrationConnections/{connectionId}
adminAuditEvents/{auditEventId}
```

## First UI Flow

Start with the superadmin onboarding wizard:

1. Company profile.
2. Services and service area.
3. FAQs and approved answers.
4. Emergency, booking, and disallowed-topic rules.
5. Phone routing and integrations.
6. Test calls checklist.
7. Launch readiness.

This comes before the owner dashboard because it creates clean tenant data and prevents launch mistakes.

## Company User UI

The company dashboard starts with daily operations instead of setup:

- Today's calls, new leads, escalations, and upcoming inspections.
- Lead queue with urgency, address, roof issue, and follow-up status.
- Call transcripts, summaries, classifications, and agent actions.
- Appointment list or calendar view.
- Limited agent settings for services, FAQs, emergency rules, booking rules, escalation phone, and notification email.

Company users must never see other tenants, global phone mappings, provider secrets, superadmin audit logs, or tenant security controls.

## Low-Friction Setup Principle

The company user experience should ask for the minimum needed to start:

- Company name, service area, escalation contact, and notification email.
- Confirm the prefilled industry template instead of building rules from scratch.
- Let the business choose a simple receptionist name and greeting, with safe defaults already filled in.
- Show connection status as simple labels like Connected, Needs attention, or Not connected.
- Keep provider credentials, OAuth details, model settings, and advanced routing in the superadmin flow.
