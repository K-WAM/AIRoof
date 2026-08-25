# Admin Onboarding Guide — Add & Configure a New Business

This guide walks you (as admin/superadmin) through onboarding a new service business to the AI Receptionist Platform.

## Overview: Onboarding Workflow

```
1. Collect Business Info
   ↓
2. Create Business in Firestore
   ↓
3. Configure BusinessConfig (services, FAQs, rules, etc.)
   ↓
4. Set Up Phone Number Mapping
   ↓
5. Seed Initial FAQs & Rules
   ↓
6. Test Agent Responses
   ↓
7. Deploy to Production
```

---

## Step 1: Collect Business Information

Before onboarding, gather from the business owner:

### Business Identity
- **Business Name** (e.g., "Apex Roofing")
- **Industry** (roofing, landscaping, dental, HVAC, property management, etc.)
- **Business ID** (slugified, e.g., "apex-roofing")
- **Phone Number** (main business line, e.g., "+1 (604) 555-1234")
- **Escalation Phone** (where calls should be escalated, e.g., "+1 (604) 555-0000")
- **Notification Email** (for admin alerts, e.g., "dispatch@apexroofing.com")

### Service Area
- **Service Area** (list of cities/regions, e.g., ["Vancouver", "Burnaby", "Coquitlam"])
- **Service Area Description** (optional, e.g., "Greater Vancouver region")

### Services & Availability
- **Approved Services** (list of 3-8 core services, e.g., "Roof inspections", "Shingle replacement")
- **Business Hours** (format: "Mon: 08:00 - 17:00" or full JSON object by day)
- **Emergency Support?** (is 24/7 escalation available? yes/no)

### FAQs & Rules
- **Common Questions** (5-10 FAQs from their existing website or support emails)
- **Emergency Situations** (what constitutes emergency for this business?)
- **Booking Requirements** (24-hour notice? minimum service call fee? same-day availability?)
- **Disallowed Topics** (topics the AI should NOT discuss, e.g., "pricing details", "insurance claims")

### Integrations
- **Google Calendar Integration?** (yes: requires service account / no: uses mock)
- **Twilio Phone Number** (will be provisioned by admin later)

---

## Step 2: Create Business in Firestore (Admin Only)

### Option A: Manual Creation (Firebase Console)

1. Go to [Firebase Console](https://console.firebase.google.com) → Your Project → Firestore
2. Create a new document at `businesses/{businessId}` with this structure:

```json
{
  "businessId": "apex-roofing",
  "businessName": "Apex Roofing",
  "industry": "roofing",
  "phoneNumber": "+1 (604) 555-1234",
  "serviceArea": ["Vancouver", "Burnaby", "New Westminster", "Coquitlam"],
  "businessHours": {
    "Monday": "08:00 - 17:00",
    "Tuesday": "08:00 - 17:00",
    "Wednesday": "08:00 - 17:00",
    "Thursday": "08:00 - 17:00",
    "Friday": "08:00 - 17:00",
    "Saturday": "09:00 - 13:00",
    "Sunday": "Closed"
  },
  "approvedServices": [
    "Roof inspections and assessments",
    "Shingle replacement and repairs",
    "Metal roofing installation",
    "Emergency water leak repairs"
  ],
  "approvedFaqs": [],
  "emergencyRules": [],
  "bookingRules": [],
  "disallowedTopics": [],
  "escalationPhone": "+1 (604) 555-0000",
  "notificationEmail": "dispatch@apexroofing.com",
  "calendarProvider": "mock",
  "active": true,
  "createdAt": <UNIX_TIMESTAMP>,
  "updatedAt": <UNIX_TIMESTAMP>
}
```

3. Create empty subcollections by creating a dummy document and deleting it:
   - `businesses/{businessId}/calls`
   - `businesses/{businessId}/leads`
   - `businesses/{businessId}/appointments`
   - `businesses/{businessId}/agentActions`

### Option B: Automated Creation (TypeScript Script)

Create `scripts/onboard-business.ts`:

```typescript
import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import type { BusinessConfig } from "../src/types";

// Read from command-line args or interactive prompt
const businessId = process.argv[2] || "new-business";
const businessName = process.argv[3] || "New Business";

const config: BusinessConfig = {
  businessId,
  businessName,
  industry: "roofing", // TODO: parameterize
  phoneNumber: "+1 (604) 555-1234",
  serviceArea: ["Vancouver"],
  businessHours: {
    Monday: "08:00 - 17:00",
    Tuesday: "08:00 - 17:00",
    Wednesday: "08:00 - 17:00",
    Thursday: "08:00 - 17:00",
    Friday: "08:00 - 17:00",
    Saturday: "Closed",
    Sunday: "Closed",
  },
  approvedServices: ["Service 1", "Service 2"],
  approvedFaqs: [],
  emergencyRules: [],
  bookingRules: [],
  disallowedTopics: [],
  escalationPhone: "+1 (604) 555-0000",
  notificationEmail: "admin@business.com",
  calendarProvider: "mock",
  active: true,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const db = admin.firestore();
await db.collection("businesses").doc(businessId).set(config);
console.log(`✓ Created business: ${businessName} (${businessId})`);
```

Run: `npx ts-node scripts/onboard-business.ts apex-roofing "Apex Roofing"`

---

## Step 3: Configure BusinessConfig

Once created, populate the full **BusinessConfig** document with all constraints:

### 3.1 Approved Services

These are the ONLY services the AI can discuss. List 3-8 core services:

```json
"approvedServices": [
  "Roof inspections and assessments",
  "Shingle replacement and repairs",
  "Metal roofing installation",
  "Emergency water leak repairs",
  "Flashing and valley repairs",
  "Gutter cleaning and installation"
]
```

The AI will only discuss these. Any request outside this scope gets: "I can only help with [BusinessName] services, scheduling, or messages for the team."

### 3.2 Approved FAQs

Build a library of 5-10 common questions and approved answers. These answers are LOCKED — the AI cannot ad-lib or hallucinate answers.

```json
"approvedFaqs": [
  {
    "question": "Do you offer emergency services?",
    "answer": "Yes, we can typically respond to emergency calls same-day. Please call us immediately if you have water damage or a leak."
  },
  {
    "question": "What areas do you service?",
    "answer": "We service Vancouver, Burnaby, New Westminster, and Coquitlam. Call us to confirm your address."
  },
  {
    "question": "How much does an inspection cost?",
    "answer": "Inspections are $150 and include a written report. That fee is credited toward any repair quote we provide."
  },
  {
    "question": "Do you offer warranties?",
    "answer": "Yes, all new installations come with a 10-year workmanship warranty and access to manufacturer warranties on materials."
  }
]
```

**How to collect FAQs:**
1. Review business's website FAQ section
2. Ask business owner: "What are the 10 most common questions you get?"
3. Review support emails and call notes for patterns
4. Run `/api/cron/faq-suggestions` after first week of calls to auto-generate suggestions

### 3.3 Emergency Rules

Define what constitutes an emergency for THIS business:

```json
"emergencyRules": [
  "If caller mentions water entry, leak, or active damage: escalate immediately",
  "If caller mentions electrical hazards, fire damage, or safety risk: escalate immediately",
  "If caller's urgency is 'urgent': confirm appointment within same business day",
  "If caller is blocking traffic or requires police: call 911 first, then escalate"
]
```

The scope classifier will detect these keywords and set `category: "emergency"` with `allowedToAnswer: true`, forcing the agent to prioritize escalation.

### 3.4 Booking Rules

Define constraints on appointment booking:

```json
"bookingRules": [
  "Only book appointments during business hours",
  "Minimum 24-hour notice for non-emergency appointments",
  "Emergency appointments can be scheduled ASAP (same day if possible)",
  "Collect caller name, phone, service type, and address before confirming",
  "Maximum 2 appointments per caller per day",
  "Appointment slots are 1 hour unless specified otherwise"
]
```

These are read by the AI before executing `bookAppointment` tool. The agent will NOT book if these rules are violated.

### 3.5 Disallowed Topics

Topics the business does NOT want the AI to discuss (beyond the global OFF_TOPIC patterns):

```json
"disallowedTopics": [
  "pricing in detail (defer to team)",
  "warranty terms (defer to team)",
  "insurance claims (defer to team)",
  "financing options (defer to team)"
]
```

If a caller asks about these, the AI responds: "I can help you schedule an appointment or leave a message for the team regarding that."

---

## Step 4: Set Up Phone Number Mapping

When Twilio calls come in, the `/api/webhooks/twilio/incoming` endpoint needs to map the incoming phone number to a `businessId`.

### Current Implementation (Stub in code)

In `src/app/api/webhooks/twilio/incoming/route.ts`, there's a stub function:

```typescript
async function mapPhoneToBusinessId(phoneNumber: string): Promise<string | null> {
  // TODO: Implement phone number to business mapping
  if (phoneNumber.includes("604") || phoneNumber === "+16045551234") {
    return "demo-roofing";
  }
  return null;
}
```

### Production Implementation: Firestore Lookup

Add a `businessPhoneNumbers` collection in Firestore:

```
businessPhoneNumbers/{phoneNumberId}
  ├── phoneNumber: "+1 (604) 555-1234"
  ├── businessId: "apex-roofing"
  ├── twilioPhonenumber: "xxx-xxx-xxxx"
  ├── active: true
  └── createdAt: timestamp
```

Update the mapping function:

```typescript
async function mapPhoneToBusinessId(phoneNumber: string): Promise<string | null> {
  const db = getAdminFirestore();
  const snapshot = await db
    .collection("businessPhoneNumbers")
    .where("phoneNumber", "==", normalizePhone(phoneNumber))
    .where("active", "==", true)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return snapshot.docs[0].data().businessId;
}

function normalizePhone(phone: string): string {
  // Remove formatting: +1 (604) 555-1234 → +16045551234
  return phone.replace(/\D/g, "");
}
```

When you provision a Twilio number for a business, create the mapping:

```bash
firebase firestore:set businessPhoneNumbers/apex-roofing-main '{
  "phoneNumber": "+1 (604) 555-1234",
  "businessId": "apex-roofing",
  "twilioPhoneNumber": "+16045551234",
  "active": true,
  "createdAt": "'$(date +%s)'000"
}'
```

---

## Step 5: Seed Initial Data

After creating the business, populate it with:

### 5.1 Admin User

Create an admin user in Firebase Auth (if multi-tenant admin dashboard is built):

```bash
firebase auth:set <email> --custom-claims '{"role":"admin","businessId":"apex-roofing"}'
```

### 5.2 Sample Leads & Appointments (Optional)

For testing, you can seed historical data:

```bash
firebase firestore:set businesses/apex-roofing/leads/lead_sample_001 '{
  "leadId": "lead_sample_001",
  "businessId": "apex-roofing",
  "callerName": "John Smith",
  "callerPhone": "+1 (604) 555-9999",
  "serviceRequested": "Roof inspection",
  "address": "123 Main St, Vancouver, BC",
  "urgency": "normal",
  "status": "new",
  "createdAt": "'$(date +%s)'000",
  "updatedAt": "'$(date +%s)'000"
}'
```

---

## Step 6: Test Agent Responses

Once the business is configured, test that the AI responds correctly:

### Test 1: On-Topic Scheduling
```bash
curl -X POST http://localhost:3000/api/agent/respond \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "apex-roofing",
    "callId": "test_001",
    "callerMessage": "I need to schedule a roof inspection",
    "callerPhone": "+1 (604) 555-9999"
  }'
```

**Expected**: Agent responds with scheduling options, mentions services from `approvedServices`

### Test 2: FAQ Question
```bash
curl -X POST http://localhost:3000/api/agent/respond \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "apex-roofing",
    "callId": "test_002",
    "callerMessage": "Do you offer emergency services?",
    "callerPhone": "+1 (604) 555-9999"
  }'
```

**Expected**: Agent returns the exact answer from `approvedFaqs`, verbatim.

### Test 3: Off-Topic Request
```bash
curl -X POST http://localhost:3000/api/agent/respond \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "apex-roofing",
    "callId": "test_003",
    "callerMessage": "What stocks should I invest in?",
    "callerPhone": "+1 (604) 555-9999"
  }'
```

**Expected**: `allowedToAnswer: false`, generic redirect: "I can only help with Apex Roofing services, scheduling, or messages for the team."

### Test 4: Emergency Detection
```bash
curl -X POST http://localhost:3000/api/agent/respond \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "apex-roofing",
    "callId": "test_004",
    "callerMessage": "We have water flooding through the ceiling right now!",
    "callerPhone": "+1 (604) 555-9999"
  }'
```

**Expected**: `category: "emergency"`, agent response prioritizes escalation to +1 (604) 555-0000

---

## Step 7: Deploy to Production

### 7.1 Enable Business

Set `active: true` in Firestore (should already be set during creation).

### 7.2 Deploy Firestore Security Rules

Ensure rules enforce multi-tenant isolation. In `firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Authenticated users can only access their own business data
    match /businesses/{businessId} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/businessUsers/$(request.auth.uid)).data.businessId == businessId;
    }
  }
}
```

Deploy: `firebase deploy --only firestore:rules`

### 7.3 Provision Twilio Number

1. Buy a new Twilio phone number
2. Configure webhook to: `https://yourdomain.com/api/webhooks/twilio/incoming`
3. Create phone mapping in Firestore (Step 4)
4. Test incoming call (press Gather prompt, speak, verify transcription)

### 7.4 Configure Google Calendar (Optional)

If using real Google Calendar:

1. Create service account in Google Cloud Console
2. Share the business's Google Calendar with the service account email
3. Add `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON` to env vars
4. Update `calendarProvider: "google"` in BusinessConfig

### 7.5 Set Up Notifications

Configure Twilio SMS and SendGrid email:

1. Add `TWILIO_AUTH_TOKEN` and `SENDGRID_API_KEY` to env vars
2. Update `escalateCall` tool to send real SMS/email
3. Test escalation with a test call

### 7.6 Verify Production Checklist

- [ ] Business created in Firestore
- [ ] BusinessConfig fully populated (services, FAQs, rules)
- [ ] Phone number mapped to businessId
- [ ] Twilio number provisioned and webhook configured
- [ ] Firestore security rules deployed
- [ ] All 4 test calls pass (scheduling, FAQ, off-topic, emergency)
- [ ] Admin can view calls in console
- [ ] Escalation sends real SMS/email
- [ ] Google Calendar synced (if enabled)

---

## Operational Workflows

### Update Business Config

To update services, FAQs, or rules after launch:

1. Edit the document in Firebase Console, OR
2. Create `src/app/api/admin/businesses/[businessId]/config` endpoint (POST/PUT)
3. Changes take effect immediately (no restart needed)
4. **Test immediately** with `/api/agent/respond` to verify

### View Call History

Access in Firebase Console:
- `businesses/{businessId}/calls/{callId}` → `messages[]` array
- Each message includes: role (caller/agent), text, classification, timestamp

### Analyze Calls for FAQ Suggestions

After 100+ calls, run:

```bash
curl -X POST http://localhost:3000/api/cron/faq-suggestions \
  -H "Authorization: Bearer $CRON_SECRET" \
  -d '{"businessId": "apex-roofing"}'
```

This uses DeepSeek to analyze transcripts and suggest new FAQs.

### Manage Leads & Appointments

These are auto-created by agent tools when the AI:
- Creates a lead: `createLead` tool → stored at `businesses/{businessId}/leads/{id}`
- Books appointment: `bookAppointment` tool → stored at `businesses/{businessId}/appointments/{id}`

Admin can view/export these for CRM integration.

---

## Industry-Specific Templates

### Roofing (Template)

**Emergency Rules:**
- Water entry, active leak, flooding
- Electrical hazards, fire damage
- Storm damage, structural concern

**Booking Rules:**
- 24-hour notice (except emergencies)
- Service area confirmation
- Estimate appointment: 30 min
- Full service: 2-8 hours (varies by scope)

**Disallowed Topics:**
- Precise pricing (defer to team estimate)
- Insurance claim details (defer to adjuster)
- Structural engineering (defer to licensed engineer)

### Dental (Template)

**Emergency Rules:**
- Severe pain, infection, swelling
- Trauma/broken tooth
- Abscess or oral infection

**Booking Rules:**
- New patient form required (mail/email first)
- Appointment: 15-60 min depending on procedure
- 24-hour cancellation notice
- Insurance pre-auth if applicable

**Disallowed Topics:**
- Medical diagnosis
- Prescription medication details
- Insurance coverage (defer to billing)

### HVAC (Template)

**Emergency Rules:**
- No heat (winter)
- No cooling (summer, extreme temperature)
- Gas leak smell
- Unusual noises or burning smell

**Booking Rules:**
- Same-day emergency appointment if available
- Service call fee applies (waived if service completed)
- 4-hour appointment window
- Seasonal demand (winter/summer longer wait)

**Disallowed Topics:**
- Repair vs. replacement decision (defer to technician)
- Extended warranty upsell (defer to tech)

---

## Troubleshooting

### Problem: AI Discusses Unauthorized Topic
**Cause**: Topic not in `disallowedTopics` or OFF_TOPIC patterns don't match
**Fix**: Add to `disallowedTopics` in BusinessConfig, re-test

### Problem: Appointment Not Booking
**Cause**: Booking rules violated (time outside hours, no notice, etc.)
**Fix**: Review `bookingRules`, relax constraints if needed

### Problem: Phone Number Not Mapping to Business
**Cause**: No entry in `businessPhoneNumbers` or number format mismatch
**Fix**: Create phone mapping, verify number normalization (remove formatting)

### Problem: FAQ Answer Not Used
**Cause**: AI generated custom answer instead of using approved FAQ
**Fix**: Review system prompt, ensure FAQ is in the prompt, add to `disallowedTopics` if needed

### Problem: Off-Topic Not Rejected
**Cause**: Pattern not in `OFF_TOPIC_PATTERNS` or `disallowedTopics`
**Fix**: Add regex pattern to `scopeClassifier.ts` or topic to BusinessConfig

---

## Reporting & Analytics (Phase 10+)

Once admin dashboard is built, track per-business:
- **Call Volume**: incoming calls per day/week
- **Conversion Rate**: leads booked → appointments scheduled
- **Escalation Rate**: % of calls requiring human intervention
- **Average Call Duration**: time in seconds
- **Off-Topic Refusal Rate**: % of calls rejected before OpenAI
- **FAQ Hit Rate**: % of calls answered by FAQ (no OpenAI needed)
- **Cost Per Call**: (OpenAI + Twilio) / # calls

---

## Support Escalation

If a business needs custom behavior not in the platform:
1. Document the request in a GitHub issue
2. Evaluate if it requires code changes or config-only changes
3. For config-only: add new field to BusinessConfig schema and prompt builder
4. For code: plan Feature Request for next phase
5. Provide ETA to business owner
> **Historical pre-Vapi guide.** Do not follow the Twilio, generated `onboard-business.ts`, or Google Calendar
> steps in this file. Use `public/guides/onboarding-guide.html` and `/admin/onboarding` for current onboarding.
