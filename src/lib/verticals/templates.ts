import type { BusinessConfig } from "@/types";

export type VerticalId =
  | "roofing"
  | "hvac"
  | "landscaping"
  | "cleaning"
  | "dental"
  | "property-management"
  | "general-contractors";

/**
 * Per-vertical wording for the shared company UI. Every surface that would
 * otherwise hardcode a roofing noun reads from here instead, so adding a
 * vertical is a template edit rather than a hunt through the pages.
 * `jobNoun`/`jobNounPlural` are only meaningful when the "jobs" module is on.
 */
export interface VerticalVocab {
  jobNoun: string;
  jobNounPlural: string;
  customerNoun: string;
  customerNounPlural: string;
  /** Who the Calendar's rows are: a roofing crew, an HVAC tech, a dentist, a vendor. */
  resourceNoun: string;
  resourceNounPlural: string;
  /** Example spoken field update, shown in the Guide. */
  voiceExample: string;
  /** Placeholder for the job title input. */
  jobTitlePlaceholder: string;
  /** Placeholder for the job serviceType input. */
  serviceTypePlaceholder: string;
  /** Placeholder for the Library's resource-name input. */
  resourcePlaceholder: string;
  /** Placeholder for a Library material row. */
  materialPlaceholder: string;
  /** Placeholder for a Library document name. */
  documentPlaceholder: string;
}

/**
 * What the Calendar board schedules.
 *  - "jobs":         drag an unscheduled job onto a crew + day (field service).
 *  - "appointments": drag a booking onto a provider/vendor + day (intake).
 * Every vertical gets a Calendar — only the rows and the cards differ.
 */
export type CalendarMode = "jobs" | "appointments";

export interface VerticalTemplate {
  verticalId: VerticalId;
  label: string;
  description: string;
  vocab: VerticalVocab;
  calendarMode: CalendarMode;
  approvedServices: BusinessConfig["approvedServices"];
  approvedFaqs: BusinessConfig["approvedFaqs"];
  emergencyRules: BusinessConfig["emergencyRules"];
  bookingRules: BusinessConfig["bookingRules"];
  disallowedTopics: BusinessConfig["disallowedTopics"];
  agentName: string;
  agentIdentity: string;
  greetingTemplate: string;
  afterHoursGreetingTemplate: string;
  agentTone: string;
  icon: string;
  color: string;
  shortLabel: string;
  sampleCallerScript: string;
  /**
   * Surfaces this industry doesn't use. Every vertical keeps Dashboard/Calls/
   * Pipeline/Calendar/Settings/Guide — only these are optional:
   *  - "jobs":    Jobs + Field tabs (field-service only)
   *  - "pricing": the Library's materials/labor catalog (feeds job invoices)
   *  - "library": the whole Library tab (roster + docs) — currently unused
   */
  disabledModules: Array<"jobs" | "pricing" | "library">;
}

export const VERTICAL_TEMPLATES: Record<VerticalId, VerticalTemplate> = {
  roofing: {
    verticalId: "roofing",
    label: "Roofing",
    description: "Inspections, repairs, estimates, leaks, and storm-response triage.",
    calendarMode: "jobs",
    vocab: {
      jobNoun: "Job",
      jobNounPlural: "Jobs",
      customerNoun: "Customer",
      customerNounPlural: "Customers",
      resourceNoun: "Crew",
      resourceNounPlural: "Crews",
      voiceExample: "used 12 bundles of shingles, Kevin worked 8 to 4, found a cracked vent",
      jobTitlePlaceholder: "e.g. Roof inspection — 123 Main St",
      serviceTypePlaceholder: "Shingle replacement",
      resourcePlaceholder: "Carlos Crew",
      materialPlaceholder: "Shingles bundle",
      documentPlaceholder: "Shingle warranty 2026",
    },
    approvedServices: [
      "Roof inspections and assessments",
      "Shingle replacement and repairs",
      "Metal roofing installation",
      "Emergency water leak repairs",
      "Flashing and valley repairs",
      "Gutter cleaning and installation",
    ],
    approvedFaqs: [
      {
        question: "Do you offer emergency services?",
        answer:
          "Yes, we can typically respond to emergency calls same-day. Please call us immediately if you have water damage or a leak.",
      },
      {
        question: "What areas do you service?",
        answer:
          "We service the configured service area. Please provide your address so we can confirm availability.",
      },
      {
        question: "How much does an inspection cost?",
        answer:
          "Inspection pricing depends on the business configuration. The team can confirm the current fee before booking.",
      },
      {
        question: "Do you offer warranties?",
        answer:
          "Warranty details vary by project and materials. The team can review applicable workmanship and manufacturer warranties.",
      },
    ],
    emergencyRules: [
      "If caller mentions active water entry, leak, or flooding: escalate immediately",
      "If caller mentions electrical hazards, fire damage, or safety risk: escalate immediately",
      "If caller mentions storm damage with exposed roof or interior damage: prioritize same-day follow-up",
      "If caller indicates immediate danger: advise them to contact emergency services first, then escalate",
    ],
    bookingRules: [
      "Only book appointments during business hours unless the call is an emergency",
      "Minimum 24-hour notice for non-emergency appointments",
      "Collect caller name, phone, service type, address, urgency, and preferred time before confirming",
      "Emergency appointments can be requested ASAP if same-day availability exists",
    ],
    disallowedTopics: [
      "detailed pricing without inspection",
      "insurance claim advice",
      "legal advice",
      "structural engineering conclusions",
      "financing terms unless explicitly configured",
    ],
    agentName: "Roofus",
    agentIdentity: "receptionist",
    greetingTemplate: "Thanks for calling {businessName}, this is Roofus. How can I help?",
    afterHoursGreetingTemplate:
      "Thanks for calling {businessName}, this is Roofus. The office is closed, but I can still help take a message or flag an urgent roof leak.",
    agentTone: "calm, friendly, concise, and efficient",
    icon: "HardHat",
    color: "#1e3a5f",
    shortLabel: "Roofing",
    sampleCallerScript:
      "Hey [Prospect], imagine your customer calling after last night's storm — your AI books the inspection, sends the confirmation, and captures the lead, all while you're on the roof. Want to hear it live?",
    disabledModules: [],
  },

  hvac: {
    verticalId: "hvac",
    label: "HVAC",
    description: "Heating, cooling, maintenance, and urgent comfort/safety calls.",
    calendarMode: "jobs",
    vocab: {
      jobNoun: "Service call",
      jobNounPlural: "Service calls",
      customerNoun: "Customer",
      customerNounPlural: "Customers",
      resourceNoun: "Tech",
      resourceNounPlural: "Techs",
      voiceExample: "replaced the capacitor, added 2 pounds of R-410A, Marco was on site 9 to 12",
      jobTitlePlaceholder: "e.g. AC not cooling — 123 Main St",
      serviceTypePlaceholder: "AC repair",
      resourcePlaceholder: "Marco R.",
      materialPlaceholder: "R-410A refrigerant (lb)",
      documentPlaceholder: "Carrier warranty 2026",
    },
    approvedServices: [
      "AC installation and replacement",
      "Heating system installation",
      "AC repair and maintenance",
      "Duct cleaning and sealing",
      "Smart thermostat installation",
      "Emergency AC repair",
    ],
    approvedFaqs: [
      {
        question: "How fast can you respond to an emergency?",
        answer:
          "We offer same-day emergency service, typically within 2–4 hours. Call us right away and we'll get a tech dispatched.",
      },
      {
        question: "What brands do you service?",
        answer:
          "We service all major brands including Carrier, Trane, Lennox, Goodman, and more. If you're unsure, just let us know your model.",
      },
      {
        question: "What's included in a tune-up?",
        answer:
          "A standard tune-up includes coil cleaning, refrigerant check, filter replacement, electrical inspection, and a written report.",
      },
    ],
    emergencyRules: [
      "If caller has no cooling during extreme heat: escalate immediately",
      "If caller mentions elderly person or infant in home without AC: prioritize same-day response",
      "If caller reports gas smell near HVAC unit: advise calling the gas company immediately, then escalate",
    ],
    bookingRules: [
      "Collect full address, system brand and age, and issue description before confirming booking",
      "Emergency slots available same-day; standard tune-ups require 48-hour notice",
      "Always confirm preferred contact number before ending the call",
    ],
    disallowedTopics: [
      "detailed pricing without a site visit",
      "warranty legal advice",
      "DIY refrigerant handling",
    ],
    agentName: "Claire",
    agentIdentity: "receptionist",
    greetingTemplate: "Thanks for calling {businessName}, this is Claire. How can I help?",
    afterHoursGreetingTemplate:
      "Thanks for calling {businessName}. The office is closed but I'm Claire — I can still take a message or flag an AC emergency.",
    agentTone: "warm, professional, and safety-aware",
    icon: "Wind",
    color: "#1a5276",
    shortLabel: "HVAC",
    sampleCallerScript:
      "Hi [Prospect], imagine your customers calling — AC out in July — and your receptionist books them same-day without you lifting a finger. Want to see it live right now?",
    disabledModules: [],
  },

  landscaping: {
    verticalId: "landscaping",
    label: "Landscaping",
    description: "Seasonal maintenance, estimates, cleanup, and recurring service requests.",
    calendarMode: "jobs",
    vocab: {
      jobNoun: "Job",
      jobNounPlural: "Jobs",
      customerNoun: "Customer",
      customerNounPlural: "Customers",
      resourceNoun: "Crew",
      resourceNounPlural: "Crews",
      voiceExample: "laid 15 pallets of sod, trimmed the hedges, Luis and Ana worked 7 to 2",
      jobTitlePlaceholder: "e.g. Sod install — 123 Main St",
      serviceTypePlaceholder: "Sod installation",
      resourcePlaceholder: "Luis Crew",
      materialPlaceholder: "Sod pallet",
      documentPlaceholder: "Irrigation warranty 2026",
    },
    approvedServices: [
      "Lawn maintenance and mowing",
      "Landscape design and installation",
      "Irrigation system installation and repair",
      "Tree trimming and removal",
      "Sod installation",
      "Mulching and edging",
    ],
    approvedFaqs: [
      {
        question: "Do you offer recurring maintenance plans?",
        answer:
          "Yes, we offer weekly, bi-weekly, and monthly maintenance plans. We can set you up with the right schedule during booking.",
      },
      {
        question: "Are you licensed and insured?",
        answer:
          "Yes, we are fully licensed and insured with up to $2M in liability coverage for your peace of mind.",
      },
      {
        question: "Do you work on HOA properties?",
        answer:
          "Absolutely. We're familiar with HOA requirements and can work within any community guidelines.",
      },
    ],
    emergencyRules: [
      "If caller mentions storm damage blocking driveway or access: prioritize same-week removal",
      "If caller reports fallen tree on structure or vehicle: escalate immediately",
    ],
    bookingRules: [
      "Always confirm service address and property size before booking",
      "First-time consultations require a site visit — schedule within 72 hours",
      "Collect HOA requirements if the property is in a managed community",
    ],
    disallowedTopics: [
      "pest control advice",
      "structural repairs",
      "pool service",
    ],
    agentName: "Maya",
    agentIdentity: "receptionist",
    greetingTemplate: "Hi, thanks for calling {businessName}! This is Maya. What can I help you with today?",
    afterHoursGreetingTemplate:
      "Thanks for calling {businessName}. The office is closed, but I'm Maya and I can still take your details or flag a storm emergency.",
    agentTone: "friendly, upbeat, and organized",
    icon: "Leaf",
    color: "#1e8449",
    shortLabel: "Landscaping",
    sampleCallerScript:
      "Hey [Prospect], picture a homeowner calling for a lawn quote Saturday morning — your AI qualifies them, books a site visit, sends a confirmation, all while you're on another job. Sound useful?",
    disabledModules: [],
  },

  cleaning: {
    verticalId: "cleaning",
    label: "Cleaning",
    description: "Recurring housekeeping, deep cleans, move-outs, and post-construction jobs.",
    calendarMode: "jobs",
    vocab: {
      jobNoun: "Clean",
      jobNounPlural: "Cleans",
      customerNoun: "Customer",
      customerNounPlural: "Customers",
      resourceNoun: "Team",
      resourceNounPlural: "Teams",
      voiceExample: "3 hours at the Henderson house, used 2 gallons of floor cleaner, the den carpet is stained",
      jobTitlePlaceholder: "e.g. Move-out clean — 123 Main St",
      serviceTypePlaceholder: "Deep clean",
      resourcePlaceholder: "Team A — Rosa",
      materialPlaceholder: "Floor cleaner (gal)",
      documentPlaceholder: "Insurance certificate 2026",
    },
    approvedServices: [
      "Recurring house cleaning",
      "Deep cleaning",
      "Move-in and move-out cleaning",
      "Post-construction cleanup",
      "Office and commercial cleaning",
      "Carpet and upholstery cleaning",
    ],
    approvedFaqs: [
      {
        question: "Do you bring your own supplies?",
        answer:
          "Yes, our teams arrive with all supplies and equipment included. If you'd prefer we use specific products, just let us know.",
      },
      {
        question: "Are you insured and background-checked?",
        answer:
          "Yes. Every cleaner is background-checked, and we carry full liability insurance and bonding.",
      },
      {
        question: "Do I need to be home?",
        answer:
          "Not at all. Most customers give us entry instructions or a lockbox code. We'll note whatever you're comfortable with.",
      },
      {
        question: "How much does a clean cost?",
        answer:
          "Pricing depends on the size of the home and the type of clean. The team can confirm a quote before booking.",
      },
    ],
    emergencyRules: [
      "If caller reports flooding or water damage needing urgent cleanup: prioritize same-day response",
      "If caller reports a biohazard, sewage, or mold situation: escalate to the team — do not quote over the phone",
      "If caller is locked out or reports a property access problem during a scheduled clean: escalate immediately",
    ],
    bookingRules: [
      "Collect address, home size (bedrooms/bathrooms), and clean type before confirming",
      "Ask whether this is one-time or recurring, and capture the preferred frequency",
      "Collect entry instructions (home, lockbox, or key) and any pets in the home",
    ],
    disallowedTopics: [
      "firm pricing without knowing home size",
      "guarantees about stain or damage removal",
      "mold remediation advice",
      "employment or hiring inquiries",
    ],
    agentName: "Robin",
    agentIdentity: "receptionist",
    greetingTemplate: "Thanks for calling {businessName}, this is Robin. How can I help?",
    afterHoursGreetingTemplate:
      "Thanks for calling {businessName}. The office is closed, but I'm Robin — I can get you a quote started or book a clean right now.",
    agentTone: "warm, tidy, and detail-oriented",
    icon: "Sparkles",
    color: "#0d9488",
    shortLabel: "Cleaning",
    sampleCallerScript:
      "Hey [Prospect], someone calls Sunday night wanting a move-out clean Tuesday — your AI quotes it, books it, and puts it on the board before you've picked up the phone. Want to hear it?",
    disabledModules: [],
  },

  dental: {
    verticalId: "dental",
    label: "Dental",
    description: "Appointments, patient intake, office FAQs, and urgent dental triage.",
    // No field jobs — the Calendar schedules patients onto providers instead.
    calendarMode: "appointments",
    vocab: {
      jobNoun: "Appointment",
      jobNounPlural: "Appointments",
      customerNoun: "Patient",
      customerNounPlural: "Patients",
      resourceNoun: "Provider",
      resourceNounPlural: "Providers",
      voiceExample: "",
      jobTitlePlaceholder: "",
      serviceTypePlaceholder: "",
      resourcePlaceholder: "Dr. Rivera",
      materialPlaceholder: "",
      documentPlaceholder: "New patient intake form",
    },
    approvedServices: [
      "New patient appointments",
      "Routine cleanings and exams",
      "Emergency dental appointments",
      "Teeth whitening consultations",
      "Orthodontic consultations",
      "Denture and crown consultations",
    ],
    approvedFaqs: [
      {
        question: "Do you accept my insurance?",
        answer:
          "Insurance acceptance varies by plan. Our team can verify your coverage — just have your provider and member ID ready when you call.",
      },
      {
        question: "What do I need to do before my first visit?",
        answer:
          "New patients will need to complete an intake form before their appointment. We'll send it to you by email after booking.",
      },
      {
        question: "Can I get seen today for a dental emergency?",
        answer:
          "Yes, we prioritize dental emergencies and keep same-day slots available. Let us know your situation and we'll get you in as soon as possible.",
      },
    ],
    emergencyRules: [
      "If caller describes severe tooth pain, swelling, or trauma: offer a same-day emergency slot",
      "If caller reports a broken or knocked-out tooth: advise them to come in immediately",
      "If caller mentions difficulty swallowing or breathing: advise calling 911 immediately",
    ],
    bookingRules: [
      "Collect patient name, date of birth, and insurance provider before confirming",
      "New patients require a minimum 60-minute appointment slot",
      "Dental emergencies take priority over routine scheduling",
    ],
    disallowedTopics: [
      "diagnosis or treatment recommendations",
      "medication advice",
      "insurance claim advice",
      "HIPAA-protected records details",
    ],
    agentName: "Aria",
    agentIdentity: "receptionist",
    greetingTemplate: "Thank you for calling {businessName}, this is Aria. How can I help you today?",
    afterHoursGreetingTemplate:
      "Thanks for calling {businessName}. The office is closed, but I'm Aria — I can take your name and number so we call you back first thing in the morning.",
    agentTone: "calm, reassuring, and privacy-conscious",
    icon: "Smile",
    color: "#0e6fa7",
    shortLabel: "Dental",
    sampleCallerScript:
      "Hey [Prospect], your front desk just missed a call from a new patient with a toothache. Our AI would have booked them a same-day slot instantly. Want to hear how it sounds?",
    // No field jobs. Calendar stays (patients → providers); Library stays for the
    // provider roster + documents, minus the materials catalog (see "pricing").
    disabledModules: ["jobs", "pricing"],
  },

  "property-management": {
    verticalId: "property-management",
    label: "Property Management",
    description: "Tenant maintenance, owner inquiries, after-hours escalation, and work orders.",
    // No field jobs — the Calendar dispatches requests onto vendors/on-call staff.
    calendarMode: "appointments",
    vocab: {
      jobNoun: "Work order",
      jobNounPlural: "Work orders",
      customerNoun: "Tenant",
      customerNounPlural: "Tenants",
      resourceNoun: "Vendor",
      resourceNounPlural: "Vendors",
      voiceExample: "",
      jobTitlePlaceholder: "",
      serviceTypePlaceholder: "",
      resourcePlaceholder: "Ace Plumbing",
      materialPlaceholder: "",
      documentPlaceholder: "Vendor insurance cert",
    },
    approvedServices: [
      "Maintenance request intake",
      "Tenant onboarding scheduling",
      "Move-in and move-out coordination",
      "Work order follow-up",
      "Owner inquiry routing",
      "After-hours emergency escalation",
    ],
    approvedFaqs: [
      {
        question: "How do I submit a maintenance request?",
        answer:
          "You can submit a request right here with me, or through the tenant portal. I'll log everything and make sure it reaches the right team.",
      },
      {
        question: "What counts as a maintenance emergency?",
        answer:
          "Flooding, gas leaks, fire, no heat in winter, or a broken entry lock are all emergencies. Tell me what's happening and I'll escalate immediately.",
      },
      {
        question: "I have a question about my rent payment.",
        answer:
          "Rent payment questions go to the accounting team. Let me take your name and number and have someone call you back.",
      },
    ],
    emergencyRules: [
      "If caller reports flooding, gas leak, fire, or no heat in winter: escalate immediately",
      "If caller reports a broken entry lock or security breach: escalate immediately",
      "If caller mentions a medical emergency on the property: advise calling 911 first, then escalate",
    ],
    bookingRules: [
      "Log unit number, tenant name, and issue description for every maintenance request",
      "Owner inquiries require callback scheduling — do not share financial data verbally",
      "After-hours emergency calls go directly to the on-call manager",
    ],
    disallowedTopics: [
      "lease legal advice",
      "rent negotiation",
      "eviction procedures",
      "financial statements",
    ],
    agentName: "Val",
    agentIdentity: "receptionist",
    greetingTemplate: "Thanks for calling {businessName} — this is Val. How can I direct your call?",
    afterHoursGreetingTemplate:
      "Thanks for calling {businessName}. The office is closed, but I'm Val — I can take a maintenance request or escalate an emergency right now.",
    agentTone: "clear, structured, and escalation-aware",
    icon: "Building",
    color: "#5a3ea1",
    shortLabel: "Prop Mgmt",
    sampleCallerScript:
      "Hey [Prospect], your tenant calls at 11pm about a burst pipe — our AI answers, escalates to your on-call, creates a work order, all before you see it in the morning. Want a live demo?",
    // No field jobs. Calendar dispatches requests to vendors; Library keeps the
    // vendor roster + documents, minus the materials catalog (see "pricing").
    disabledModules: ["jobs", "pricing"],
  },

  "general-contractors": {
    verticalId: "general-contractors",
    label: "General Contractors",
    description: "Project estimates, remodels, build-outs, and job site coordination.",
    calendarMode: "jobs",
    vocab: {
      jobNoun: "Project",
      jobNounPlural: "Projects",
      customerNoun: "Client",
      customerNounPlural: "Clients",
      resourceNoun: "Crew",
      resourceNounPlural: "Crews",
      voiceExample: "hung 40 sheets of drywall, framing inspection passed, Dave's crew worked 7 to 3",
      jobTitlePlaceholder: "e.g. Kitchen remodel — 123 Main St",
      serviceTypePlaceholder: "Kitchen renovation",
      resourcePlaceholder: "Dave's Crew",
      materialPlaceholder: "Drywall sheet 4x8",
      documentPlaceholder: "Permit set 2026",
    },
    approvedServices: [
      "Project consultations and estimates",
      "Residential remodeling",
      "Commercial build-outs",
      "Kitchen and bathroom renovations",
      "Additions and structural work",
      "Permit coordination assistance",
    ],
    approvedFaqs: [
      {
        question: "Are you licensed and insured?",
        answer:
          "Yes, we carry a full general contractor license and liability insurance. We can provide documentation on request.",
      },
      {
        question: "How long will my project take?",
        answer:
          "Timeline depends on scope. We'll give you a detailed schedule after a consultation and site review.",
      },
      {
        question: "Do you use subcontractors?",
        answer:
          "Yes, we work with a vetted team of licensed, insured subcontractors for specialized trades like electrical and plumbing.",
      },
    ],
    emergencyRules: [
      "If caller reports structural failure or collapse risk: escalate immediately",
      "If caller reports active water intrusion through a construction site: escalate same-day",
      "If caller mentions a safety hazard on a job site: escalate immediately",
    ],
    bookingRules: [
      "Collect project type, address, rough scope, and budget range before scheduling",
      "Initial consultations are free — schedule within 5 business days",
      "Collect preferred contact method and best callback time",
    ],
    disallowedTopics: [
      "specific cost guarantees",
      "permit approval timelines",
      "legal subcontractor disputes",
      "detailed engineering specifications",
    ],
    agentName: "Rex",
    agentIdentity: "receptionist",
    greetingTemplate: "Thanks for calling {businessName}, this is Rex. How can I help?",
    afterHoursGreetingTemplate:
      "Thanks for calling {businessName}. The office is closed, but I'm Rex — I can take your project details and have someone call you first thing.",
    agentTone: "direct, professional, and project-aware",
    icon: "Hammer",
    color: "#b45309",
    shortLabel: "GC",
    sampleCallerScript:
      "Hey [Prospect], a homeowner just called asking for a kitchen remodel quote — your AI captured all the project details, booked a site visit, and sent a confirmation. Sound like something your crew needs?",
    disabledModules: [],
  },
};

export function getVerticalTemplate(verticalId: string): VerticalTemplate {
  return VERTICAL_TEMPLATES[(verticalId as VerticalId) || "roofing"] || VERTICAL_TEMPLATES.roofing;
}

/**
 * Persona the *live demo line* answers as. Only differs from the template when the
 * provisioned Vapi assistant already has a name in the field — roofing's is
 * "Alice - Roofing", while a real roofing tenant onboarded from the template is
 * "Roofus". Both the Demo Studio UI and the demo-customize API resolve through
 * here so the screen can't promise one name and the phone say another.
 */
const DEMO_AGENT_NAME_OVERRIDE: Partial<Record<VerticalId, string>> = {
  roofing: "Alice",
};

export function demoAgentName(verticalId: VerticalId): string {
  return DEMO_AGENT_NAME_OVERRIDE[verticalId] ?? VERTICAL_TEMPLATES[verticalId].agentName;
}
