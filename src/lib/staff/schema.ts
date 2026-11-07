import { z } from "zod";
import { USER_TYPES } from "@/lib/team/userTypes";
import { toE164 } from "@/lib/phoneLines/registry";

// Input validation for the staff routes (T-371a). Caps keep one bad request from filling a document.

const userTypeIds = USER_TYPES.map((type) => type.id) as [string, ...string[]];

const text = (label: string, max: number) =>
  z.string({ error: `${label} must be text` }).trim().max(max, `${label} is too long (max ${max})`);

/** "" or null clears the field on a PATCH. */
const clearable = (label: string, max: number) => z.union([text(label, max), z.null()]);

const emailText = (label: string) =>
  text(label, 200).refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), { message: "Email doesn't look right" });

const mobileText = text("Mobile", 40).refine((value) => value === "" || /\d{7}/.test(value.replace(/\D/g, "")), { message: "Mobile doesn't look like a phone number" });

export const staffCreateSchema = z.object({
  name: text("Name", 120).min(1, "A person needs a name"),
  position: text("Job title", 120).optional(),
  userType: z.enum(userTypeIds, { error: "Unknown app access" }).optional(),
  email: emailText("Email").optional(),
  mobile: mobileText.optional(),
  language: z.enum(["en", "es", "both"], { error: "Language must be en, es or both" }).optional(),
  crewId: text("Crew", 80).optional(),
});

export const staffPatchSchema = z.object({
  position: clearable("Job title", 120).optional(),
  userType: z.enum(userTypeIds, { error: "Unknown app access" }).optional(),
  email: z.union([emailText("Email"), z.null()]).optional(),
  mobile: z.union([mobileText, z.null()]).optional(),
  language: z.union([z.enum(["en", "es", "both"], { error: "Language must be en, es or both" }), z.null()]).optional(),
  crewId: clearable("Crew", 80).optional(),
  active: z.boolean({ error: "active must be true or false" }).optional(),
});

/** First problem as one plain sentence. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue?.message ?? "That doesn't look right";
}

/** E.164 when it parses, else as typed. */
export function normalizeMobile(raw: string): string {
  return toE164(raw) ?? raw.trim();
}
