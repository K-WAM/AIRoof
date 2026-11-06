import type { EmailSendingSetup } from "@/types";

export type EmailSendingValidation =
  | { valid: true; value: EmailSendingSetup }
  | { valid: false; errors: Record<string, string> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const DNS_HOSTS = ["godaddy", "cloudflare", "google", "wix", "squarespace", "namecheap", "other"] as const;
const MODES = ["luxor", "own-domain"] as const;

const SENDER_NAME_MAX = 80;
const CONTACT_NAME_MAX = 80;
const DNS_HOST_OTHER_MAX = 80;
const NOTES_MAX = 500;
const EMAIL_MAX = 254;
const DOMAIN_MAX = 253;

type Fields = Record<string, unknown>;

function asFields(value: unknown): Fields | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Fields) : null;
}

/**
 * Trims, length-caps and format-checks the email-sending details collected at onboarding / client edit.
 * mode "luxor" means Luxor picks the sending address, so every own-domain/DNS field is dropped.
 */
export function validateEmailSending(input: unknown): EmailSendingValidation {
  const fields = asFields(input);
  if (!fields) return { valid: false, errors: { _root: "Email sending details must be an object." } };

  const errors: Record<string, string> = {};
  const value: EmailSendingSetup = {};

  if (fields.mode !== undefined) {
    if (typeof fields.mode !== "string" || !MODES.includes(fields.mode as (typeof MODES)[number])) {
      errors.mode = "Choose the Luxor address or the client's own domain.";
    } else {
      value.mode = fields.mode as EmailSendingSetup["mode"];
    }
  }

  if (fields.senderName !== undefined) {
    const text = trimmed(fields.senderName, "senderName", SENDER_NAME_MAX, errors);
    if (text !== undefined) value.senderName = text;
  }

  if (fields.replyTo !== undefined) {
    const replyTo = emailField(fields.replyTo, "replyTo", errors);
    if (replyTo !== undefined) value.replyTo = replyTo;
  }

  if (fields.notes !== undefined) {
    const text = trimmed(fields.notes, "notes", NOTES_MAX, errors);
    if (text !== undefined) value.notes = text;
  }

  if (value.mode !== "luxor") {
    if (fields.ownDomain !== undefined) {
      if (typeof fields.ownDomain !== "string") {
        errors.ownDomain = "Enter a domain such as roofdoctorsfl.com.";
      } else {
        const domain = fields.ownDomain.trim().toLowerCase();
        if (domain) {
          if (domain.length > DOMAIN_MAX || !DOMAIN_PATTERN.test(domain)) {
            errors.ownDomain = "Enter a plain domain such as roofdoctorsfl.com (no https:// or paths).";
          } else {
            value.ownDomain = domain;
          }
        }
      }
    }

    if (fields.dnsHost !== undefined) {
      if (typeof fields.dnsHost !== "string" || !DNS_HOSTS.includes(fields.dnsHost as (typeof DNS_HOSTS)[number])) {
        errors.dnsHost = "Choose who manages the client's DNS.";
      } else {
        value.dnsHost = fields.dnsHost as EmailSendingSetup["dnsHost"];
      }
    }

    if (fields.dnsHostOther !== undefined) {
      const text = trimmed(fields.dnsHostOther, "dnsHostOther", DNS_HOST_OTHER_MAX, errors);
      if (text !== undefined) value.dnsHostOther = text;
    }

    if (fields.dnsContactName !== undefined) {
      const text = trimmed(fields.dnsContactName, "dnsContactName", CONTACT_NAME_MAX, errors);
      if (text !== undefined) value.dnsContactName = text;
    }

    if (fields.dnsContactEmail !== undefined) {
      const emailValue = emailField(fields.dnsContactEmail, "dnsContactEmail", errors);
      if (emailValue !== undefined) value.dnsContactEmail = emailValue;
    }
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, value };
}

function trimmed(value: unknown, field: string, max: number, errors: Record<string, string>): string | undefined {
  if (typeof value !== "string") {
    errors[field] = "Enter text.";
    return undefined;
  }
  const text = value.trim();
  if (!text) return undefined;
  if (text.length > max) {
    errors[field] = `Keep this under ${max} characters.`;
    return undefined;
  }
  return text;
}

function emailField(value: unknown, field: string, errors: Record<string, string>): string | undefined {
  if (typeof value !== "string") {
    errors[field] = "Enter a valid email address.";
    return undefined;
  }
  const text = value.trim();
  if (!text) return undefined;
  if (text.length > EMAIL_MAX || !EMAIL_PATTERN.test(text)) {
    errors[field] = "Enter a valid email address.";
    return undefined;
  }
  return text;
}
