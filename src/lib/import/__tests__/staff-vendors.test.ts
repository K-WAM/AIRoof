import { expect, it } from "vitest";
import { cleanEmail, e164, mapStaff, mapVendors, planWrites, staffIdFor, vendorIdFor } from "../../../../scripts/lib/staff-vendors.mjs";

const NOW = 1_760_000_000_000;
const row = (over: Record<string, string> = {}) => ({ Enabled: "Yes", ...over });

function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(hasUndefined);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some(hasUndefined);
  return false;
}

it("derives stable ids that ignore case and extra spacing", () => {
  expect(staffIdFor(" Example  Person ")).toBe(staffIdFor("example person"));
  expect(staffIdFor("Example Person")).toMatch(/^jobba-staff-[0-9a-f]{16}$/);
  expect(vendorIdFor(" Example  Supply ")).toBe(vendorIdFor("example supply"));
  expect(vendorIdFor("Example Supply")).toMatch(/^jobba-vendor-[0-9a-f]{16}$/);
});

it("turns 10 and 11 digit numbers into E.164 and refuses anything else", () => {
  expect(e164("(954) 555-0123")).toBe("+19545550123");
  expect(e164("1 954 555 0123")).toBe("+19545550123");
  expect(e164("44 20 7946 0000")).toBeNull();
  expect(e164("")).toBeNull();
  expect(e164(undefined)).toBeNull();
});

it("lower-cases valid email and drops a truncated address", () => {
  expect(cleanEmail("  NAME@Example.COM ")).toBe("name@example.com");
  expect(cleanEmail("name@domain")).toBeNull();
  expect(cleanEmail("name @example.com")).toBeNull();
  expect(cleanEmail("")).toBeNull();
});

it("maps each userType rule in priority order", () => {
  const cases: Array<[Record<string, string>, string | undefined]> = [
    [{ Primary: "Yes", Position: "Technician" }, "admin"],
    [{ Position: "Service Supervisor" }, "supervisor"],
    [{ Position: "Office Manager" }, "office_admin"],
    [{ Position: "Project Manager" }, "manager"],
    [{ Type: "Inspector, Service" }, "inspector"],
    [{ Type: "BackOffice, Estimator" }, "office"],
    [{ Position: "Lead Technician" }, "technician"],
    [{ Type: "Service" }, "technician"],
    [{ Position: "Helper" }, undefined],
  ];
  for (const [over, expected] of cases) {
    const { staff } = mapStaff([row({ "First Name": "Sample", "Last Name": "Person", ...over })], [], [], NOW);
    if (expected) expect(staff[0].userType).toBe(expected);
    else expect(staff[0]).not.toHaveProperty("userType");
  }
});

it("makes a crew foreman a foreman and a lead of the first crew found", () => {
  const { staff } = mapStaff(
    [row({ "First Name": "Sample", "Last Name": "Lead", Email: "lead@example.com" })],
    [
      { Enabled: "Yes", Name: "Alpha Crew", Foreman: "Sample Lead" },
      { Enabled: "Yes", Name: "Beta Crew", Foreman: " Sample Lead " },
      { Enabled: "No", Name: "Gamma Crew", Foreman: "Sample Lead" },
    ],
    [{ crewId: "crew-1", name: "Alpha Crew" }, { crewId: "crew-2", name: "Beta Crew" }, { crewId: "crew-3", name: "Gamma Crew" }],
    NOW,
  );
  expect(staff[0]).toMatchObject({ userType: "foreman", crewId: "crew-1", crewLead: true });
  expect(staff[0].provenance).toEqual({ origin: "client", source: "jobba:Company contacts.csv", addedAt: NOW });
  expect(staff[0].createdAt).toBe(NOW);
  expect(staff[0].updatedAt).toBe(NOW);
});

it("does not invent a crew when the crew document is missing", () => {
  const { staff } = mapStaff(
    [row({ "First Name": "Sample", "Last Name": "Lead" })],
    [{ Enabled: "Yes", Name: "Absent Crew", Foreman: "Sample Lead" }],
    [],
    NOW,
  );
  expect(staff[0].userType).toBe("foreman");
  expect(staff[0]).not.toHaveProperty("crewId");
  expect(staff[0]).not.toHaveProperty("crewLead");
});

it("skips disabled rows, blank names and the Powerboard display account", () => {
  const { staff, notes } = mapStaff(
    [
      { Enabled: "No", "First Name": "Sample", "Last Name": "Disabled" },
      row({ "First Name": "", "Last Name": "" }),
      row({ "First Name": "Power", "Last Name": "Board" }),
      row({ "First Name": "Powerboard", "Last Name": "User" }),
      row({ "First Name": "Example", "Last Name": "Person" }),
    ],
    [],
    [],
    NOW,
  );
  expect(staff.map(record => record.name)).toEqual(["Example Person"]);
  expect(notes.filter(note => note.includes("skipped (not a person)"))).toHaveLength(2);
});

it("drops an invalid email and keeps a valid mobile without storing undefined", () => {
  const { staff, notes } = mapStaff(
    [
      row({ "First Name": "Example", "Last Name": "Person", Email: "name@domain", "Mobile Phone": "954 555 0123" }),
      row({ "First Name": "Second", "Last Name": "Person", Email: "", "Mobile Phone": "" }),
    ],
    [],
    [],
    NOW,
  );
  expect(staff[0].email).toBeUndefined();
  expect(staff[0].mobile).toBe("+19545550123");
  expect(staff[1]).not.toHaveProperty("email");
  expect(staff[1]).not.toHaveProperty("mobile");
  expect(notes.some(note => note.includes("email dropped"))).toBe(true);
  expect(hasUndefined(staff)).toBe(false);
});

it("matches a crew by the person's name and marks it as a demo guess", () => {
  const { staff } = mapStaff(
    [row({ "First Name": "Example", "Last Name": "Crew", Type: "Service" })],
    [],
    [{ crewId: "crew-1", name: "Example Crew" }],
    NOW,
  );
  expect(staff[0]).toMatchObject({
    userType: "technician",
    crewId: "crew-1",
    crewProvenance: { origin: "luxor-sample", source: "luxor:demo-fill", note: "Matched by crew name; confirm in the Team form", addedAt: NOW },
  });
  expect(staff[0]).not.toHaveProperty("crewLead");
});

it("round-robins remaining field people over crews with a foreman lead, deterministically", () => {
  const contacts = [
    row({ "First Name": "Sample", "Last Name": "Tech B", Position: "Technician" }),
    row({ "First Name": "Sample", "Last Name": "Inspector", Type: "Inspector" }),
    row({ "First Name": "Sample", "Last Name": "Tech A", Type: "Service" }),
    row({ "First Name": "Sample", "Last Name": "Lead" }),
    row({ "First Name": "Other", "Last Name": "Lead" }),
  ];
  const crewRows = [
    { Enabled: "Yes", Name: "Zulu Crew", Foreman: "Sample Lead" },
    { Enabled: "Yes", Name: "Alpha Crew", Foreman: "Other Lead" },
    { Enabled: "Yes", Name: "No Lead Crew" },
  ];
  const existingCrews = [
    { crewId: "crew-z", name: "Zulu Crew" },
    { crewId: "crew-a", name: "Alpha Crew" },
    { crewId: "crew-n", name: "No Lead Crew" },
  ];
  const first = mapStaff(contacts, crewRows, existingCrews, NOW).staff;
  const second = mapStaff([...contacts].reverse(), crewRows, existingCrews, NOW).staff;
  const assign = (records: Array<{ name: string; crewId?: string; crewProvenance?: unknown }>) => Object.fromEntries(records.filter(record => record.crewProvenance).map(record => [record.name, record.crewId]));
  expect(assign(first)).toEqual({ "Sample Inspector": "crew-a", "Sample Tech A": "crew-z", "Sample Tech B": "crew-a" });
  expect(assign(second)).toEqual(assign(first));
  expect(first.filter(record => record.crewProvenance).every(record => record.crewProvenance.note === "Crew membership guessed for the demo; confirm in the Team form")).toBe(true);
  expect(first.some(record => record.crewId === "crew-n")).toBe(false);
});

it("never guesses a crew for office staff or for someone already on a crew", () => {
  const { staff } = mapStaff(
    [row({ "First Name": "Example", "Last Name": "Crew", Type: "BackOffice" }), row({ "First Name": "Sample", "Last Name": "Lead" })],
    [{ Enabled: "Yes", Name: "Alpha Crew", Foreman: "Sample Lead" }],
    [{ crewId: "crew-1", name: "Alpha Crew" }],
    NOW,
  );
  expect(staff[0]).not.toHaveProperty("crewId");
  expect(staff[1]).toMatchObject({ crewId: "crew-1", crewLead: true });
  expect(staff[1]).not.toHaveProperty("crewProvenance");
});

it("maps vendors, normalises a two-letter state and keeps an unparseable main number", () => {
  const vendors = mapVendors(
    [
      { Name: " Example Supply ", Type: "Supplier", Address: "1 Example Way", City: "Sampleville", State: "fl", Main: "(954) 555-0100", Contact: "Sample Contact" },
      { Name: "Second Supplier", State: "Florida", Main: "call the office" },
      { Name: "  " },
    ],
    NOW,
  );
  expect(vendors).toHaveLength(2);
  expect(vendors[0]).toEqual({
    vendorId: vendorIdFor("Example Supply"),
    name: "Example Supply",
    active: true,
    provenance: { origin: "client", source: "jobba:vendors.csv", addedAt: NOW },
    createdAt: NOW,
    updatedAt: NOW,
    type: "Supplier",
    address: "1 Example Way",
    city: "Sampleville",
    state: "FL",
    phone: "+19545550100",
    contactName: "Sample Contact",
  });
  const second = vendors[1] as { state?: string; phone?: string };
  expect(second.state).toBeUndefined();
  expect(second.phone).toBe("call the office");
  expect(hasUndefined(vendors)).toBe(false);
});

it("plans a create for a missing document and a skip for an identical one", () => {
  const [staff] = mapStaff([row({ "First Name": "Example", "Last Name": "Person", Type: "Service" })], [], [], NOW).staff;
  expect(planWrites([staff], new Map())).toEqual([{ id: staff.staffId, action: "create", fields: staff }]);
  const existing = new Map([[staff.staffId, { ...staff }]]);
  expect(planWrites([staff], existing)).toEqual([{ id: staff.staffId, action: "skip", fields: {} }]);
});

it("fills only missing or empty fields and never overwrites an owner's edit", () => {
  const [staff] = mapStaff(
    [row({ "First Name": "Example", "Last Name": "Person", Position: "Technician", Email: "new@example.com" })],
    [],
    [],
    NOW,
  ).staff;
  const existing = new Map([[staff.staffId, {
    staffId: staff.staffId,
    name: "Owner Edit",
    active: false,
    email: "kept@example.com",
    linkedUid: "uid-2",
    provenance: staff.provenance,
    createdAt: NOW - 50,
    updatedAt: NOW - 50,
  }]]);
  const [plan] = planWrites([{ ...staff, linkedUid: "uid-1" }], existing);
  expect(plan.action).toBe("fill");
  expect(plan.fields).toEqual({ userType: "technician", position: "Technician" });
  expect(plan.fields).not.toHaveProperty("name");
  expect(plan.fields).not.toHaveProperty("email");
  expect(plan.fields).not.toHaveProperty("active");
  expect(plan.fields).not.toHaveProperty("linkedUid");
  expect(plan.fields).not.toHaveProperty("createdAt");
});

it("fills an empty email and a missing crew, but never replaces a client crew", () => {
  const [staff] = mapStaff(
    [row({ "First Name": "Example", "Last Name": "Person", Type: "Service" })],
    [{ Enabled: "Yes", Name: "Example Crew", Foreman: "Example Person" }],
    [{ crewId: "crew-1", name: "Example Crew" }],
    NOW,
  ).staff;
  const base = {
    staffId: staff.staffId,
    name: staff.name,
    active: true,
    email: "",
    userType: staff.userType,
    crewLead: staff.crewLead,
    provenance: staff.provenance,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const [fill] = planWrites([{ ...staff, email: "new@example.com" }], new Map([[staff.staffId, { ...base, crewId: undefined, crewProvenance: undefined }]]));
  expect(fill.fields).toMatchObject({ email: "new@example.com", crewId: "crew-1" });

  const clientCrew = { ...base, crewId: "crew-owner", crewProvenance: { origin: "client", source: "app:team", addedAt: NOW } };
  const [keep] = planWrites([{ ...staff, crewId: "crew-1", crewProvenance: undefined }], new Map([[staff.staffId, clientCrew]]));
  expect(keep.action).toBe("skip");
  expect(keep.fields).not.toHaveProperty("crewId");

  const unprovenanced = { ...base, crewId: "crew-owner" };
  const [keepUnknown] = planWrites([{ ...staff, crewId: "crew-1", crewProvenance: undefined }], new Map([[staff.staffId, unprovenanced]]));
  expect(keepUnknown.fields).not.toHaveProperty("crewId");
});

it("may replace a demo crew guess with a crew named by the client, never the other way round", () => {
  const [staff] = mapStaff(
    [row({ "First Name": "Example", "Last Name": "Person", Type: "Service" })],
    [],
    [{ crewId: "crew-1", name: "Example Crew" }],
    NOW,
  ).staff;
  const base = {
    staffId: staff.staffId,
    name: staff.name,
    active: true,
    userType: staff.userType,
    provenance: staff.provenance,
    createdAt: NOW,
    updatedAt: NOW,
    crewId: "crew-guess",
    crewProvenance: { origin: "luxor-sample", source: "luxor:demo-fill", note: "Crew membership guessed for the demo; confirm in the Team form", addedAt: NOW },
  };
  const [upgrade] = planWrites([{ ...staff, crewId: "crew-1", crewProvenance: undefined }], new Map([[staff.staffId, base]]));
  expect(upgrade.fields).toEqual({ crewId: "crew-1", crewProvenance: staff.provenance });

  const [confirmed] = planWrites([{ ...staff, crewId: "crew-guess", crewProvenance: undefined }], new Map([[staff.staffId, base]]));
  expect(confirmed.fields).toEqual({ crewProvenance: staff.provenance });

  const [keepGuess] = planWrites([staff], new Map([[staff.staffId, base]]));
  expect(keepGuess.action).toBe("skip");
});

it("contains no undefined values in mapped or planned output", () => {
  const { staff } = mapStaff(
    [
      row({ "First Name": "Example", "Last Name": "Person" }),
      row({ "First Name": "Second", "Last Name": "Person", Email: "second@example.com", "Mobile Phone": "954 555 0123" }),
    ],
    [{ Enabled: "Yes", Name: "Alpha Crew", Foreman: "Second Person" }],
    [{ crewId: "crew-1", name: "Alpha Crew" }],
    NOW,
  );
  const vendors = mapVendors([{ Name: "Example Supply" }], NOW);
  const plans = [...planWrites(staff, new Map()), ...planWrites(vendors, new Map())];
  expect(hasUndefined({ staff, vendors, plans })).toBe(false);
});
