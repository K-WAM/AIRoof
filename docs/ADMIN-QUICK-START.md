# Admin Quick Start — Onboard a Business in 5 Steps

Fast reference for onboarding a new service business.

## 1️⃣ Collect Business Info

- **Business ID** (slug): `apex-roofing`
- **Business Name**: `Apex Roofing`
- **Industry**: `roofing` (or landscaping, dental, HVAC, property management)
- **Phone**: `+1 (604) 555-1234`
- **Service Area**: `["Vancouver", "Burnaby", "New Westminster"]`
- **Business Hours**: `Mon-Fri: 08:00-17:00, Sat: 09:00-13:00, Sun: Closed`
- **Escalation Phone**: `+1 (604) 555-0000`
- **Notification Email**: `dispatch@apexroofing.com`

## 2️⃣ Create in Firebase Console

Go to **Firestore → Collections → Create Collection `businesses`**

Create new document `{businessId}` with:

```json
{
  "businessId": "apex-roofing",
  "businessName": "Apex Roofing",
  "industry": "roofing",
  "phoneNumber": "+1 (604) 555-1234",
  "serviceArea": ["Vancouver", "Burnaby"],
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
  "approvedFaqs": [
    {
      "question": "Do you offer emergency services?",
      "answer": "Yes, we can respond same-day to emergency calls."
    },
    {
      "question": "What areas do you service?",
      "answer": "We service Vancouver, Burnaby, and surrounding areas."
    }
  ],
  "emergencyRules": [
    "If caller mentions water leak or flooding: escalate immediately",
    "If caller mentions electrical or fire hazard: escalate immediately"
  ],
  "bookingRules": [
    "Only book during business hours",
    "Minimum 24-hour notice (except emergencies)",
    "Collect name, phone, service type, and address before confirming"
  ],
  "disallowedTopics": [
    "pricing in detail (defer to team)",
    "insurance claims (defer to team)"
  ],
  "escalationPhone": "+1 (604) 555-0000",
  "notificationEmail": "dispatch@apexroofing.com",
  "calendarProvider": "mock",
  "active": true,
  "createdAt": 1716144000000,
  "updatedAt": 1716144000000
}
```

Then create empty subcollections by clicking **Create Collection**:
- `calls`
- `leads`
- `appointments`
- `agentActions`

## 3️⃣ Configure Approved Answers

Add 5-10 FAQs that the AI MUST answer verbatim (no hallucination).

**Best sources:**
- Business website FAQ section
- Common support emails
- Ask business owner: "What are your 10 most common questions?"

### Good FAQ Example
```json
{
  "question": "How much does an inspection cost?",
  "answer": "Inspections are $150 and include a written report. That fee is credited toward any repair quote."
}
```

### Bad FAQ Example ❌
```json
{
  "question": "How much do you charge?",
  "answer": "Pricing varies by project scope."  // Too vague, AI will hallucinate
}
```

## 4️⃣ Test Agent Responses

In terminal or Postman, test these 3 critical flows:

### Test A: On-Topic (Should Work)
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

**Expected**: Agent responds about scheduling, mentions approved services ✅

### Test B: Off-Topic (Must Reject Before OpenAI)
```bash
curl -X POST http://localhost:3000/api/agent/respond \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "apex-roofing",
    "callId": "test_002",
    "callerMessage": "What stocks should I buy?",
    "callerPhone": "+1 (604) 555-9999"
  }'
```

**Expected**: `allowedToAnswer: false` + generic redirect response ✅
(DO NOT see OpenAI API call in logs — this is cost control!)

### Test C: FAQ Question (Must Return Exact Answer)
```bash
curl -X POST http://localhost:3000/api/agent/respond \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "apex-roofing",
    "callId": "test_003",
    "callerMessage": "How much does an inspection cost?",
    "callerPhone": "+1 (604) 555-9999"
  }'
```

**Expected**: Exact text from your FAQ: "Inspections are $150..." ✅

### Test D: Emergency (Must Escalate)
```bash
curl -X POST http://localhost:3000/api/agent/respond \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "apex-roofing",
    "callId": "test_004",
    "callerMessage": "We have water flooding through the ceiling!",
    "callerPhone": "+1 (604) 555-9999"
  }'
```

**Expected**: `category: "emergency"`, response mentions immediate escalation ✅

## 5️⃣ Deploy

### Firestore Security Rules
Deploy to prevent cross-business data leakage:

```bash
firebase deploy --only firestore:rules
```

### Twilio Number (if using)
1. Provision new Twilio number
2. Set webhook to: `https://yourdomain.com/api/webhooks/twilio/incoming`
3. Add phone mapping in Firestore:

In **businessPhoneNumbers** collection, create document:
```json
{
  "phoneNumber": "+1 (604) 555-1234",
  "businessId": "apex-roofing",
  "twilioPhoneNumber": "+16045551234",
  "active": true,
  "createdAt": 1716144000000
}
```

4. Test a real inbound call

### Notify Business Owner
- Provide phone number and testing access
- Train on booking workflow
- Share escalation procedures

---

## ✅ Onboarding Checklist

- [ ] Business created in Firestore
- [ ] All fields populated (services, FAQs, rules)
- [ ] 5-10 FAQs added with exact answers
- [ ] Emergency rules configured
- [ ] Booking rules configured
- [ ] Test A: On-topic message → agent responds ✅
- [ ] Test B: Off-topic message → rejected, no OpenAI call ✅
- [ ] Test C: FAQ question → exact answer returned ✅
- [ ] Test D: Emergency message → escalates ✅
- [ ] Firestore security rules deployed
- [ ] Twilio number provisioned & mapped (if applicable)
- [ ] Business owner notified & trained
- [ ] `active: true` in Firestore

---

## ⚠️ Critical Rules

1. **OFF-TOPIC REJECTION IS REQUIRED**: All off-topic requests must be rejected BEFORE calling OpenAI (cost control). If you see "OpenAI API called" for off-topic in logs, there's a bug.

2. **FAQ ANSWERS MUST BE EXACT**: The AI cannot ad-lib or improve FAQ answers. They go straight into the system prompt verbatim.

3. **NO CROSS-BUSINESS DATA**: Firestore security rules MUST prevent business A from seeing business B's data. Always test this.

4. **PHONE MAPPING REQUIRED**: If using Twilio, every phone number MUST map to a businessId or the webhook returns error.

---

## ❓ Troubleshooting

| Problem | Fix |
|---------|-----|
| AI ignores FAQ | Ensure FAQ is in `approvedFaqs`, refresh page |
| Off-topic NOT rejected | Add pattern to `scopeClassifier.ts` or topic to `disallowedTopics` |
| Appointment not booking | Check `bookingRules` - are constraints too strict? |
| Phone number not recognized | Add to `businessPhoneNumbers` collection, verify normalization |
| OpenAI called on off-topic | BUG - check scope classifier is running first |

---

## Need More Detail?

Full onboarding guide: **[docs/ADMIN-ONBOARDING.md](ADMIN-ONBOARDING.md)**
