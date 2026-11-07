import { z } from "zod";
import { toE164 } from "@/lib/phoneLines/registry";

// Input validation for the vendor routes (T-370). Caps: name 120, type 60, address 200, notes 1000.

const text = (label: string, max: number) =>
  z.string({ error: `${label} must be text` }).trim().max(max, `${label} is too long (max ${max})`);

const state = text("State", 2).refine((value) => value === "" || /^[A-Za-z]{2}$/.test(value), { message: "State is two letters, like FL" });
const email = text("Email", 200).refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), { message: "Email doesn't look right" });

/** Optional text fields. On a PATCH, "" (or null) clears the field. */
const FIELDS = {
  type: text("Type", 60),
  address: text("Address", 200),
  city: text("City", 80),
  state,
  zip: text("Zip", 20),
  phone: text("Phone", 40),
  contactName: text("Contact", 120),
  email,
  website: text("Website", 200),
  notes: text("Notes", 1000),
} as const;

export type VendorTextField = keyof typeof FIELDS;
export const VENDOR_TEXT_FIELDS = Object.keys(FIELDS) as VendorTextField[];

export const vendorCreateSchema = z.object({
  name: text("Name", 120).min(1, "A vendor needs a name"),
  ...Object.fromEntries(VENDOR_TEXT_FIELDS.map((key) => [key, FIELDS[key].optional()])),
} as { name: ReturnType<typeof text> } & { [K in VendorTextField]: z.ZodOptional<(typeof FIELDS)[K]> });

export const vendorPatchSchema = z.object({
  name: text("Name", 120).min(1, "A vendor needs a name").optional(),
  active: z.boolean({ error: "active must be true or false" }).optional(),
  ...Object.fromEntries(VENDOR_TEXT_FIELDS.map((key) => [key, z.union([FIELDS[key], z.null()]).optional()])),
} as { name: z.ZodOptional<ReturnType<typeof text>>; active: z.ZodOptional<z.ZodBoolean> } & { [K in VendorTextField]: z.ZodOptional<z.ZodUnion<[(typeof FIELDS)[K], z.ZodNull]>> });

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "That doesn't look right";
}

/** Per-field cleanup: state upper-cased, phone to E.164 when it parses (else as typed). */
export function normalizeVendorField(key: VendorTextField, value: string): string {
  if (key === "state") return value.toUpperCase();
  if (key === "phone") return toE164(value) ?? value;
  return value;
}
