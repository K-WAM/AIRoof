// Core multi-tenant data types for AI Receptionist Platform

// Business Configuration — source of truth for what agent can say
export interface BusinessConfig {
  businessId: string;
  businessName: string;
  industry: string;
  phoneNumber?: string;
  serviceArea: string | string[];
  businessHours: string | Record<string, string>;
  emergencyRules: string[];
  bookingRules: string[];
  escalationPhone?: string;
  notificationEmail?: string;
  approvedServices: string[];
  approvedFaqs: Array<{ question: string; answer: string }>;
  disallowedTopics: string[];
  calendarProvider?: "google" | "calendly" | "mock";
  calendarId?: string;
  planTier?: "standard" | "subscriber";
  aiProvider?: "openai";
  liveModel?: string;
  backOfficeModel?: string;
  agentName?: string;
  agentIdentity?: string;
  greeting?: string;
  afterHoursGreeting?: string;
  agentVoice?: string;
  agentTone?: string;
  temperature?: number;
  maxTokens?: number;
  // IANA timezone for this business (e.g. "America/Chicago"). Defaults to "America/New_York".
  timezone?: string;
  // Vapi integration (per-business voice agent on Vapi platform)
  vapiAssistantId?: string;
  vapiPhoneNumberId?: string;
  // Outbound callback / follow-up config
  callbackDelayMinutes?: number;   // 0 = immediate on lead; undefined = disabled
  followUpDays?: number[];         // e.g. [3, 7] — days after initial call with no booking
  maxCallAttempts?: number;        // default 3
  callbackWindowStart?: number;    // hour in business timezone (e.g. 8 = 8 AM)
  callbackWindowEnd?: number;      // e.g. 20 = 8 PM
  // Labor rate config for invoice generation
  laborRate?: {
    defaultHourlyRate: number;       // dollars/hr, e.g. 65
    lunchDeductionHours?: number;    // deducted when shift > 5h; default 0.5
    roleRates?: Array<{ role: string; rate: number }>;
  };
  // Branding (used in notification/confirmation emails)
  brandColor?: string;
  logoUrl?: string | null;
  contactPhone?: string;
  contactEmail?: string;
  websiteUrl?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

// Business onboarding state for the superadmin portal
export interface BusinessOnboardingStatus {
  businessId: string;
  profileComplete: boolean;
  agentRulesComplete: boolean;
  faqComplete: boolean;
  phoneMapped: boolean;
  calendarConfigured: boolean;
  notificationsConfigured: boolean;
  testCallsPassed: boolean;
  securityReviewed: boolean;
  readyForLaunch: boolean;
  lastReviewedAt?: number;
  reviewedByUid?: string;
  notes?: string;
}

// Phone number mapping used by Twilio webhooks to identify the tenant
export interface BusinessPhoneNumber {
  phoneNumberId: string;
  businessId: string;
  phoneNumber: string;
  normalizedPhoneNumber: string;
  twilioPhoneNumber?: string;
  label?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BusinessIntegrationStatus {
  businessId: string;
  openaiConfigured: boolean;
  deepseekConfigured: boolean;
  twilioConfigured: boolean;
  calendarConfigured: boolean;
  emailConfigured: boolean;
  smsConfigured: boolean;
  lastHealthCheckAt?: number;
  issues: Array<{
    service: "openai" | "deepseek" | "twilio" | "calendar" | "email" | "sms" | "firestore";
    severity: "info" | "warning" | "error";
    message: string;
    detectedAt: number;
  }>;
}

export interface BusinessIntegrationConnection {
  connectionId: string;
  businessId: string;
  type:
    | "calendar"
    | "email"
    | "sms"
    | "voice"
    | "crm"
    | "notifications"
    | "website_chat";
  provider:
    | "google-calendar"
    | "outlook-calendar"
    | "calendly"
    | "resend"
    | "sendgrid"
    | "twilio"
    | "jobber"
    | "servicetitan"
    | "gohighlevel"
    | "hubspot"
    | "salesforce"
    | "slack"
    | "teams"
    | "custom";
  status: "not_connected" | "connected" | "needs_attention" | "disabled";
  displayName: string;
  connectedByUid?: string;
  connectedByEmail?: string;
  lastCheckedAt?: number;
  metadata?: Record<string, string | number | boolean>;
  createdAt: number;
  updatedAt: number;
}

// Call Session — complete conversation transcript (inbound or outbound)
export interface CallSession {
  callId: string;
  businessId: string;
  callerPhone?: string;
  callerName?: string;
  startedAt: number;
  endedAt?: number;
  transcript: CallMessage[];
  status: "active" | "ended" | "failed" | "escalated";
  summary?: string;
  extractedLead?: Partial<Lead>;
  appointmentId?: string;
  escalationRequired: boolean;
  escalationReason?: string;
  recordingUrl?: string;
  // Outbound-specific fields
  callType?: "inbound" | "outbound";
  targetPhone?: string;
  initiatedByUid?: string;
  leadId?: string;
  appointmentRef?: string;
  callAttempt?: number;
  createdAt: number;
  updatedAt: number;
}

// Call Message — individual message in transcript
export interface CallMessage {
  messageId: string;
  role: "caller" | "agent" | "system" | "tool";
  text: string;
  timestamp: number;
  classification?: {
    category: string;
    confidence: number;
    reason?: string;
  };
  toolCall?: {
    toolName: string;
    input: unknown;
    output?: unknown;
  };
  metadata?: Record<string, unknown>;
}

// Lead — captured from call
export interface Lead {
  leadId: string;
  businessId: string;
  callerName?: string;
  callerPhone?: string;
  serviceRequested?: string;
  address?: string;
  urgency: "low" | "normal" | "urgent" | "unknown";
  preferredTime?: string;
  notes?: string;
  sourceCallId?: string;
  status: "new" | "contacted" | "booked" | "closed" | "lost";
  // Outbound follow-up tracking
  callAttempts?: number;
  lastCallAttemptAt?: number;
  createdAt: number;
  updatedAt: number;
}

// Appointment — scheduled service
export interface Appointment {
  appointmentId: string;
  businessId: string;
  callerName?: string;
  callerPhone?: string;
  serviceType?: string;
  address?: string;
  startTime: number;
  endTime: number;
  calendarProvider: "google" | "calendly" | "mock";
  calendarEventId?: string;
  status: "requested" | "confirmed" | "cancelled" | "completed";
  sourceCallId?: string;
  createdAt: number;
  updatedAt: number;
}

// Agent Action — logged action (booking, lead, escalation, etc)
export interface AgentAction {
  actionId: string;
  businessId: string;
  callId?: string;
  type:
    | "checkAvailability"
    | "bookAppointment"
    | "createLead"
    | "sendOwnerNotification"
    | "sendCustomerConfirmation"
    | "escalateCall"
    | "endCall"
    | "initiateOutboundCall";
  input: unknown;
  output?: unknown;
  status: "pending" | "success" | "failed";
  createdAt: number;
}

// User Business Membership
export interface UserBusinessMembership {
  uid: string;
  businessId: string;
  email?: string;
  displayName?: string;
  role: "owner" | "staff" | "viewer";
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SuperadminProfile {
  uid: string;
  email: string;
  displayName?: string;
  superadmin: true;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AdminAuditEvent {
  auditEventId: string;
  actorUid: string;
  actorEmail?: string;
  businessId?: string;
  action:
    | "business.created"
    | "business.updated"
    | "business.activated"
    | "business.deactivated"
    | "membership.created"
    | "membership.updated"
    | "phone_mapping.created"
    | "phone_mapping.updated"
    | "integration.updated"
    | "test_call.completed";
  targetPath: string;
  before?: unknown;
  after?: unknown;
  createdAt: number;
}

export interface FaqSuggestionBatch {
  suggestionId: string;
  businessId: string;
  suggestions: Array<{
    question: string;
    answer: string;
  }>;
  sourceCallCount: number;
  since: number;
  until: number;
  status: "pending_review" | "approved" | "rejected";
  reviewedByUid?: string;
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// Scope Classification Result
export interface ScopeClassification {
  category:
    | "scheduling"
    | "service_question"
    | "pricing_question"
    | "emergency"
    | "complaint"
    | "existing_appointment"
    | "off_topic"
    | "unknown";
  confidence: number;
  reason: string;
  allowedToAnswer: boolean;
}

// Agent Response
export interface AgentResponse {
  text: string;
  classification: ScopeClassification;
  allowedToAnswer: boolean;
  suggestedTool?: {
    toolName: string;
    input: unknown;
  };
  callId?: string;
}
