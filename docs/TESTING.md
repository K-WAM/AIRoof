# Testing Guide — AI Receptionist Platform

## Prerequisites

1. Seed demo business: `npx ts-node scripts/seed-demo-business.ts`
2. Set env vars: OPENAI_API_KEY, FIREBASE_* vars
3. Start dev server: `npm run dev`
4. Use curl, Postman, or VSCode REST Client for API testing

## Phase 1: Scope Classifier (Defense Layer) — CRITICAL

### Test Case 1.1: ON-TOPIC — Scheduling Request
```bash
curl -X POST http://localhost:3000/api/agent/classify \
  -H "Content-Type: application/json" \
  -d '{"businessId": "demo-roofing", "message": "I need to schedule an appointment"}'
```
Expected: `allowedToAnswer: true`, `category: "scheduling"`

### Test Case 1.2: OFF-TOPIC — Stocks (CRITICAL DEFENSE)
```bash
curl -X POST http://localhost:3000/api/agent/classify \
  -H "Content-Type: application/json" \
  -d '{"businessId": "demo-roofing", "message": "What stocks should I invest in?"}'
```
Expected: `allowedToAnswer: false`, `category: "off_topic"`

### Test Case 1.3: OFF-TOPIC — Medical Advice
```bash
curl -X POST http://localhost:3000/api/agent/classify \
  -H "Content-Type: application/json" \
  -d '{"businessId": "demo-roofing", "message": "I have back pain. What medication?"}'
```
Expected: `allowedToAnswer: false`, `category: "off_topic"`

### Test Case 1.4: EMERGENCY — Water Entry
```bash
curl -X POST http://localhost:3000/api/agent/classify \
  -H "Content-Type: application/json" \
  -d '{"businessId": "demo-roofing", "message": "We have an active water leak!"}'
```
Expected: `allowedToAnswer: true`, `category: "emergency"`

## Phase 2: Agent Response (Full Pipeline)

### Test Case 2.1: ON-TOPIC Response
```bash
curl -X POST http://localhost:3000/api/agent/respond \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "demo-roofing",
    "callId": "call_test_001",
    "callerMessage": "I need to schedule a roof inspection",
    "callerPhone": "+1 (604) 555-9999"
  }'
```
Expected: `allowedToAnswer: true`, agent response about scheduling

### Test Case 2.2: OFF-TOPIC Response (Defense)
```bash
curl -X POST http://localhost:3000/api/agent/respond \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "demo-roofing",
    "callId": "call_test_002",
    "callerMessage": "What is the best crypto investment?",
    "callerPhone": "+1 (604) 555-9999"
  }'
```
Expected: `allowedToAnswer: false`, generic redirect response, **OpenAI NOT called**

## Phase 3: Tool Execution

### Test Case 3.1: Check Availability
```bash
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "demo-roofing",
    "callId": "call_test_003",
    "toolName": "checkAvailability",
    "input": {"serviceType": "roof inspection", "durationMinutes": 60}
  }'
```
Expected: `status: "success"`, `output.available: true`, suggested slots

### Test Case 3.2: Book Appointment
```bash
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "demo-roofing",
    "callId": "call_test_004",
    "toolName": "bookAppointment",
    "input": {
      "callerName": "John Smith",
      "callerPhone": "+1 (604) 555-9999",
      "serviceType": "roof inspection",
      "address": "123 Main St, Vancouver, BC",
      "startTime": 1716380400000,
      "endTime": 1716384000000
    }
  }'
```
Expected: `status: "success"`, appointment ID, stored in Firestore

### Test Case 3.3: Create Lead
```bash
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "demo-roofing",
    "callId": "call_test_005",
    "toolName": "createLead",
    "input": {
      "callerName": "Jane Doe",
      "callerPhone": "+1 (604) 555-8888",
      "serviceRequested": "metal roofing installation",
      "address": "456 Oak Ave, Burnaby, BC",
      "urgency": "normal"
    }
  }'
```
Expected: `status: "success"`, lead ID, stored in Firestore

### Test Case 3.4: Escalate Call
```bash
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "demo-roofing",
    "callId": "call_test_006",
    "toolName": "escalateCall",
    "input": {"reason": "Structural damage requiring expert assessment"}
  }'
```
Expected: `status: "success"`, `output.escalated: true`, escalation phone

## Phase 4: Health Check

```bash
curl http://localhost:3000/api/health
```

Expected: `status: "ok"`, services status (Firestore connected, OpenAI configured)

## Phase 5: Multi-Tenant Isolation (Security)

After Firestore rules are deployed, verify cross-business access is blocked:

```bash
# attempt to access demo-roofing as other-business
curl -X GET "http://localhost:3000/api/calls/call_test_001?businessId=other-business"
```

Expected: Denied by Firestore security rules

## Firestore Verification

After running tests, verify in Firebase Console:
- `businesses/demo-roofing/calls/call_test_001` exists with messages[]
- `businesses/demo-roofing/leads/lead_*` exists
- `businesses/demo-roofing/appointments/apt_*` exists
- `businesses/demo-roofing/agentActions/action_*` exists

## Key Regression Tests

**CRITICAL**: These must always pass
1. Scope classifier rejects off-topic patterns (stocks, crypto, politics, medical, legal, financial, news, sports)
2. Scope classifier accepts on-topic patterns (scheduling, service questions, hours, location)
3. Off-topic responses do NOT trigger OpenAI calls (cost control)
4. Emergency detection works (water, electrical, urgent keywords)
5. All API responses are logged to Firestore for audit

## Performance Targets

- `/api/agent/respond` on-topic: <2s (includes OpenAI call)
- `/api/agent/respond` off-topic: <100ms (no OpenAI)
- `/api/agent/classify`: <50ms
- `/api/tools/execute`: <500ms
