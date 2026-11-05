// Who sees what, written down once — the owner's rules (docs/ROOFDOCTORS-DEMO-PLAN.md section 6), NOT derived from the
// product code. Every ACCOUNTS key in scripts/e2e/config.cjs has one entry here. The fast unit check
// (src/app/company/__tests__/role-expectations.test.ts) compares the nav model and the landing rule against this table;
// the browser plan (docs/E2E-ROLE-TEST-PLAN.md) uses the same table for pages, buttons and API probes.
//
// Adding a user type = one account in scripts/e2e/seed.cjs + one entry here.

export interface RoleExpectation {
  tenant: string; // TENANTS key
  landing: string; // where sign-in lands
  navMustShow: string[]; // nav labels that MUST appear
  navMustNotShow: string[]; // nav labels that must NOT appear
  showcaseNav?: string[]; // "Finances" / "Payroll" — only once the showcase switch is merged; checked by the browser spec
  canWrite: boolean; // false = no create/send/delete buttons, server refuses writes
  fieldVoiceNote: boolean; // can record a voice note on the Field screen
  seesPrices: boolean;
  apiProbes: Array<{
    method: "GET" | "POST" | "PUT" | "PATCH";
    path: string;
    expect: number;
    why: string;
    /** Only for probes that must carry a body to reach the auth gate (the team PATCH reads businessId from the body). */
    body?: Record<string, unknown>;
  }>;
}

const OFFICE = ["Dashboard", "Calls", "Pipeline", "Calendar", "Jobs", "Field", "Billing", "Customers", "Library", "Settings", "Guide", "Feedback"];
const OFFICE_PLUS_TEAM = ["Dashboard", "Calls", "Pipeline", "Calendar", "Jobs", "Field", "Billing", "Customers", "Library", "Team", "Settings", "Guide", "Feedback"];
const FIELD_ONLY_MUST = ["Field", "Guide", "Feedback"];
const FIELD_ONLY_MUST_NOT = ["Dashboard", "Calls", "Pipeline", "Calendar", "Jobs", "Billing", "Customers", "Library", "Team", "Settings"];

export const ROLE_EXPECTATIONS: Record<string, RoleExpectation> = {
  superadmin: {
    tenant: "roofing",
    landing: "/hub",
    navMustShow: ["Dashboard", "Team", "Settings"],
    navMustNotShow: [],
    canWrite: true,
    fieldVoiceNote: true,
    seesPrices: true,
    apiProbes: [
      { method: "GET", path: "/api/company/settings?businessId=e2e-roofing", expect: 200, why: "superadmin reads any tenant's settings" },
      { method: "GET", path: "/api/company/team?businessId=e2e-roofing", expect: 200, why: "superadmin reads any tenant's team" },
      { method: "GET", path: "/api/company/billing?businessId=e2e-roofing", expect: 200, why: "superadmin reads any tenant's billing" },
    ],
  },

  owner: {
    tenant: "roofing",
    landing: "/company/dashboard",
    navMustShow: OFFICE_PLUS_TEAM,
    navMustNotShow: [],
    canWrite: true,
    fieldVoiceNote: true,
    seesPrices: true,
    apiProbes: [
      { method: "GET", path: "/api/company/billing?businessId=e2e-roofing", expect: 200, why: "Admin sees the money screens" },
      { method: "GET", path: "/api/company/team?businessId=e2e-roofing", expect: 200, why: "Admin manages the team" },
      { method: "GET", path: "/api/company/settings?businessId=e2e-roofing", expect: 200, why: "Admin opens Settings" },
      { method: "GET", path: "/api/company/work-catalog?businessId=e2e-roofing", expect: 200, why: "Admin sees prices" },
    ],
  },

  staff: {
    tenant: "roofing",
    landing: "/company/dashboard",
    navMustShow: OFFICE,
    navMustNotShow: ["Team"],
    canWrite: true,
    fieldVoiceNote: true,
    seesPrices: true,
    apiProbes: [
      { method: "PATCH", path: "/api/company/team/e2e-crew", expect: 403, why: "Office staff cannot manage the team", body: { businessId: "e2e-roofing", displayName: "No Change" } },
      { method: "GET", path: "/api/company/billing?businessId=e2e-roofing", expect: 200, why: "Office staff sees invoices" },
      { method: "GET", path: "/api/company/settings?businessId=e2e-roofing", expect: 200, why: "Office staff may save the shared settings" },
      { method: "GET", path: "/api/company/finance?businessId=e2e-roofing", expect: 403, why: "route lands with K2" },
    ],
  },

  crew: {
    tenant: "roofing",
    landing: "/company/field",
    navMustShow: OFFICE,
    navMustNotShow: ["Team"],
    canWrite: true,
    fieldVoiceNote: true,
    seesPrices: true,
    apiProbes: [
      { method: "GET", path: "/api/company/billing?businessId=e2e-roofing", expect: 200, why: "Staff + Technician is an office login (not the field-only Crew role)" },
      { method: "GET", path: "/api/company/customers?businessId=e2e-roofing", expect: 200, why: "Staff + Technician keeps the office screens" },
      { method: "GET", path: "/api/company/settings?businessId=e2e-roofing", expect: 200, why: "Staff settings read" },
      { method: "GET", path: "/api/company/team?businessId=e2e-roofing", expect: 403, why: "only Admin manages the team" },
    ],
  },

  viewer: {
    tenant: "roofing",
    landing: "/company/dashboard",
    navMustShow: OFFICE,
    navMustNotShow: ["Team"],
    canWrite: false,
    fieldVoiceNote: false,
    seesPrices: true,
    apiProbes: [
      { method: "PUT", path: "/api/company/settings?businessId=e2e-roofing", expect: 403, why: "View only: the server refuses the write", body: { businessId: "e2e-roofing", contactEmail: "forbidden@example.test" } },
      { method: "GET", path: "/api/company/settings?businessId=e2e-roofing", expect: 200, why: "View only may look at Settings" },
      { method: "GET", path: "/api/company/billing?businessId=e2e-roofing", expect: 200, why: "View only sees the office screens, including money" },
      { method: "GET", path: "/api/company/team?businessId=e2e-roofing", expect: 403, why: "View only cannot list the team" },
      { method: "GET", path: "/api/company/customers?businessId=e2e-roofing", expect: 200, why: "View only may look at Customers" },
    ],
  },

  fieldCrew: {
    tenant: "roofing",
    landing: "/company/field",
    navMustShow: FIELD_ONLY_MUST,
    navMustNotShow: FIELD_ONLY_MUST_NOT,
    canWrite: true,
    fieldVoiceNote: true,
    seesPrices: false,
    apiProbes: [
      { method: "GET", path: "/api/company/billing?businessId=e2e-roofing", expect: 403, why: "field-only Crew is refused every office route" },
      { method: "GET", path: "/api/company/customers?businessId=e2e-roofing", expect: 403, why: "field-only Crew is refused Customers" },
      { method: "GET", path: "/api/company/settings?businessId=e2e-roofing", expect: 403, why: "field-only Crew is refused Settings" },
      { method: "GET", path: "/api/company/finance?businessId=e2e-roofing", expect: 403, why: "route lands with K2" },
      { method: "GET", path: "/api/company/crews?businessId=e2e-roofing", expect: 200, why: "field-only Crew reads its own crew row" },
    ],
  },

  dentalOwner: {
    tenant: "dental",
    landing: "/company/dashboard",
    navMustShow: ["Dashboard", "Calls", "Pipeline", "Calendar", "Settings", "Guide"],
    navMustNotShow: ["Jobs", "Field", "Billing"],
    canWrite: true,
    fieldVoiceNote: true,
    seesPrices: true,
    apiProbes: [
      { method: "GET", path: "/api/company/settings?businessId=e2e-dental", expect: 200, why: "Admin opens Settings" },
      { method: "GET", path: "/api/company/team?businessId=e2e-dental", expect: 200, why: "Admin manages the team" },
      { method: "GET", path: "/api/company/library?businessId=e2e-dental", expect: 200, why: "dental keeps the Library (providers and documents)" },
      { method: "GET", path: "/api/company/customers?businessId=e2e-dental", expect: 200, why: "dental patients live under Customers" },
    ],
  },

  emptyOwner: {
    tenant: "empty",
    landing: "/company/dashboard",
    navMustShow: OFFICE_PLUS_TEAM,
    navMustNotShow: [],
    canWrite: true,
    fieldVoiceNote: true,
    seesPrices: true,
    apiProbes: [
      { method: "GET", path: "/api/company/settings?businessId=e2e-empty", expect: 200, why: "brand-new Admin opens Settings" },
      { method: "GET", path: "/api/company/team?businessId=e2e-empty", expect: 200, why: "brand-new Admin opens the Team page" },
      { method: "GET", path: "/api/company/billing?businessId=e2e-empty", expect: 200, why: "Billing loads its empty state" },
      { method: "GET", path: "/api/company/customers?businessId=e2e-empty", expect: 200, why: "Customers loads its empty state" },
    ],
  },

  // K5: the e2e-roofpros tenant, one account per user type.

  proOwner: {
    tenant: "pros",
    landing: "/company/dashboard",
    navMustShow: OFFICE_PLUS_TEAM,
    navMustNotShow: [],
    showcaseNav: ["Finances", "Payroll"],
    canWrite: true,
    fieldVoiceNote: true,
    seesPrices: true,
    apiProbes: [
      { method: "GET", path: "/api/company/billing?businessId=e2e-roofpros", expect: 200, why: "Admin sees the money screens" },
      { method: "GET", path: "/api/company/team?businessId=e2e-roofpros", expect: 200, why: "Admin manages the team" },
      { method: "GET", path: "/api/company/settings?businessId=e2e-roofpros", expect: 200, why: "Admin opens Settings" },
      { method: "GET", path: "/api/company/work-catalog?businessId=e2e-roofpros", expect: 200, why: "Admin sees prices" },
    ],
  },

  proManager: {
    tenant: "pros",
    landing: "/company/dashboard",
    navMustShow: OFFICE_PLUS_TEAM,
    navMustNotShow: [],
    showcaseNav: ["Finances", "Payroll"],
    canWrite: true,
    fieldVoiceNote: true,
    seesPrices: true,
    apiProbes: [
      { method: "GET", path: "/api/company/team?businessId=e2e-roofpros", expect: 200, why: "Management has the same access as Admin" },
      { method: "GET", path: "/api/company/billing?businessId=e2e-roofpros", expect: 200, why: "Management sees money" },
      { method: "GET", path: "/api/company/customers?businessId=e2e-roofpros", expect: 200, why: "Management sees customers" },
    ],
  },

  proSupervisor: {
    tenant: "pros",
    landing: "/company/jobs",
    navMustShow: OFFICE,
    navMustNotShow: ["Team", "Finances", "Payroll"],
    canWrite: true,
    fieldVoiceNote: true,
    seesPrices: true,
    apiProbes: [
      { method: "PATCH", path: "/api/company/team/e2e-pro-foreman", expect: 403, why: "Supervisor cannot manage the team", body: { businessId: "e2e-roofpros", displayName: "No Change" } },
      { method: "GET", path: "/api/company/library?businessId=e2e-roofpros", expect: 200, why: "Supervisor opens the office's Library" },
      { method: "GET", path: "/api/company/billing?businessId=e2e-roofpros", expect: 200, why: "Supervisor sees prices and invoices" },
    ],
  },

  proOfficeAdmin: {
    tenant: "pros",
    landing: "/company/dashboard",
    navMustShow: OFFICE,
    navMustNotShow: ["Team", "Finances", "Payroll"],
    canWrite: true,
    fieldVoiceNote: true,
    seesPrices: true,
    apiProbes: [
      { method: "PATCH", path: "/api/company/team/e2e-pro-foreman", expect: 403, why: "Office admin cannot manage the team", body: { businessId: "e2e-roofpros", displayName: "No Change" } },
      { method: "GET", path: "/api/company/billing?businessId=e2e-roofpros", expect: 200, why: "Office admin handles payments" },
      { method: "GET", path: "/api/company/customers?businessId=e2e-roofpros", expect: 200, why: "Office admin handles customers" },
    ],
  },

  proFrontDesk: {
    tenant: "pros",
    landing: "/company/pipeline",
    navMustShow: OFFICE,
    navMustNotShow: ["Team", "Finances", "Payroll"],
    canWrite: true,
    fieldVoiceNote: true,
    // owner may want false; not built (plan section 6)
    seesPrices: true,
    apiProbes: [
      { method: "PATCH", path: "/api/company/team/e2e-pro-foreman", expect: 403, why: "Front desk cannot manage the team", body: { businessId: "e2e-roofpros", displayName: "No Change" } },
      { method: "GET", path: "/api/company/billing?businessId=e2e-roofpros", expect: 200, why: "Front desk still reads the office screens" },
      { method: "GET", path: "/api/company/settings?businessId=e2e-roofpros", expect: 200, why: "Front desk may read the shared settings" },
    ],
  },

  proForeman: {
    tenant: "pros",
    landing: "/company/field",
    navMustShow: FIELD_ONLY_MUST,
    navMustNotShow: FIELD_ONLY_MUST_NOT,
    canWrite: true,
    fieldVoiceNote: true,
    seesPrices: false,
    apiProbes: [
      { method: "GET", path: "/api/company/billing?businessId=e2e-roofpros", expect: 403, why: "field-only Crew is refused every office route" },
      { method: "GET", path: "/api/company/customers?businessId=e2e-roofpros", expect: 403, why: "field-only Crew is refused Customers" },
      { method: "GET", path: "/api/company/settings?businessId=e2e-roofpros", expect: 403, why: "field-only Crew is refused Settings" },
      { method: "GET", path: "/api/company/crews?businessId=e2e-roofpros", expect: 200, why: "field-only Crew reads its own crew row" },
    ],
  },

  proTechnician: {
    tenant: "pros",
    landing: "/company/field",
    navMustShow: FIELD_ONLY_MUST,
    navMustNotShow: FIELD_ONLY_MUST_NOT,
    canWrite: true,
    fieldVoiceNote: true,
    seesPrices: false,
    apiProbes: [
      { method: "GET", path: "/api/company/billing?businessId=e2e-roofpros", expect: 403, why: "field-only Crew is refused every office route" },
      { method: "GET", path: "/api/company/customers?businessId=e2e-roofpros", expect: 403, why: "field-only Crew is refused Customers" },
      { method: "GET", path: "/api/company/settings?businessId=e2e-roofpros", expect: 403, why: "field-only Crew is refused Settings" },
      { method: "GET", path: "/api/company/crews?businessId=e2e-roofpros", expect: 200, why: "field-only Crew reads its own crew row" },
    ],
  },

  proInspector: {
    tenant: "pros",
    landing: "/company/field",
    navMustShow: FIELD_ONLY_MUST,
    navMustNotShow: FIELD_ONLY_MUST_NOT,
    canWrite: true,
    fieldVoiceNote: true,
    seesPrices: false,
    apiProbes: [
      { method: "GET", path: "/api/company/billing?businessId=e2e-roofpros", expect: 403, why: "field-only Crew is refused every office route" },
      { method: "GET", path: "/api/company/customers?businessId=e2e-roofpros", expect: 403, why: "field-only Crew is refused Customers" },
      { method: "GET", path: "/api/company/settings?businessId=e2e-roofpros", expect: 403, why: "field-only Crew is refused Settings" },
      { method: "GET", path: "/api/company/crews?businessId=e2e-roofpros", expect: 200, why: "field-only Crew reads its own crew row" },
    ],
  },
};
