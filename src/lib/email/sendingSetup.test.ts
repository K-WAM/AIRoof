import { describe, expect, it } from "vitest";
import { validateEmailSending } from "./sendingSetup";

describe("validateEmailSending", () => {
  it("trims fields and stores an own-domain setup", () => {
    const result = validateEmailSending({
      senderName: "  Roof Doctors  ",
      replyTo: "  hello@roofdoctorsfl.com ",
      mode: "own-domain",
      ownDomain: "  RoofDoctorsFL.com ",
      dnsHost: "godaddy",
      dnsContactName: " Maria ",
      dnsContactEmail: " maria@roofdoctorsfl.com ",
      notes: "  Calls us before changing anything.  ",
    });
    expect(result).toEqual({
      valid: true,
      value: {
        senderName: "Roof Doctors",
        replyTo: "hello@roofdoctorsfl.com",
        mode: "own-domain",
        ownDomain: "roofdoctorsfl.com",
        dnsHost: "godaddy",
        dnsContactName: "Maria",
        dnsContactEmail: "maria@roofdoctorsfl.com",
        notes: "Calls us before changing anything.",
      },
    });
  });

  it("drops every own-domain and DNS field when mode is luxor", () => {
    const result = validateEmailSending({
      mode: "luxor",
      senderName: "Roof Doctors",
      replyTo: "hello@roofdoctorsfl.com",
      ownDomain: "roofdoctorsfl.com",
      dnsHost: "cloudflare",
      dnsHostOther: "Our IT person",
      dnsContactName: "Maria",
      dnsContactEmail: "maria@roofdoctorsfl.com",
      notes: "Keep the notes",
    });
    expect(result).toEqual({
      valid: true,
      value: {
        mode: "luxor",
        senderName: "Roof Doctors",
        replyTo: "hello@roofdoctorsfl.com",
        notes: "Keep the notes",
      },
    });
  });

  it("keeps own-domain fields when no mode has been chosen yet", () => {
    const result = validateEmailSending({ ownDomain: "roofdoctorsfl.com", dnsHost: "other", dnsHostOther: "Our IT person" });
    expect(result).toEqual({
      valid: true,
      value: { ownDomain: "roofdoctorsfl.com", dnsHost: "other", dnsHostOther: "Our IT person" },
    });
  });

  it("allows an empty setup", () => {
    expect(validateEmailSending({})).toEqual({ valid: true, value: {} });
  });

  it.each([
    ["senderName", "a".repeat(81)],
    ["notes", "a".repeat(501)],
    ["dnsContactName", "a".repeat(81)],
    ["dnsHostOther", "a".repeat(81)],
  ])("rejects an over-long %s", (field, value) => {
    const result = validateEmailSending({ mode: "own-domain", [field]: value });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors[field]).toBeDefined();
  });

  it.each([
    { replyTo: "not-an-email" },
    { replyTo: "two words@example.com" },
    { dnsContactEmail: "maria@" },
    { dnsContactEmail: "maria@roofdoctorsfl" },
  ])("rejects an invalid email address %j", (input) => {
    const result = validateEmailSending({ mode: "own-domain", ...input });
    expect(result.valid).toBe(false);
  });

  it.each([
    "https://roofdoctorsfl.com",
    "roofdoctorsfl.com/path",
    "roofdoctorsfl",
    "roof doctorsfl.com",
    ".roofdoctorsfl.com",
    "roofdoctorsfl.com.",
    "-roofdoctorsfl.com",
  ])("rejects a domain that is not plain: %s", (ownDomain) => {
    const result = validateEmailSending({ mode: "own-domain", ownDomain });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.ownDomain).toBeDefined();
  });

  it("accepts a subdomain", () => {
    const result = validateEmailSending({ mode: "own-domain", ownDomain: "mail.roofdoctorsfl.com" });
    expect(result).toMatchObject({ valid: true, value: { ownDomain: "mail.roofdoctorsfl.com" } });
  });

  it("rejects an unknown DNS host and an unknown mode", () => {
    const badHost = validateEmailSending({ mode: "own-domain", dnsHost: "route53" });
    expect(badHost.valid).toBe(false);
    const badMode = validateEmailSending({ mode: "other" });
    expect(badMode.valid).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(validateEmailSending(null).valid).toBe(false);
    expect(validateEmailSending("hello").valid).toBe(false);
    expect(validateEmailSending([]).valid).toBe(false);
  });
});
