import { describe, expect, it } from "vitest";
import { confirmButtonLabel, confirmChannels, notifiedPhrase } from "../confirmChannels";

describe("confirmChannels — confirm by what the caller gave on the call", () => {
  const base = { smsEnabled: true, phone: "+13055550123" };

  it("uses every channel the caller gave", () => {
    expect(confirmChannels({ ...base, email: "a@b.co", textOk: true })).toEqual(["email", "sms"]);
    expect(confirmChannels({ ...base, email: "a@b.co" })).toEqual(["email"]);
    expect(confirmChannels({ ...base, textOk: true })).toEqual(["sms"]);
    expect(confirmChannels({ ...base })).toEqual([]);
  });

  it("texts only on an explicit yes, and only while texting is on", () => {
    expect(confirmChannels({ ...base, textOk: false })).toEqual([]);
    expect(confirmChannels({ ...base, textOk: undefined })).toEqual([]);
    expect(confirmChannels({ ...base, smsEnabled: false, textOk: true })).toEqual([]);
    expect(confirmChannels({ smsEnabled: true, phone: "caller ID", textOk: true })).toEqual([]);
  });

  it("ignores an email that isn't one", () => {
    expect(confirmChannels({ ...base, email: "kareem at gmail" })).toEqual([]);
  });

  it("labels the button and the toast in plain words", () => {
    expect(confirmButtonLabel(["email", "sms"])).toBe("Confirm & email + text");
    expect(confirmButtonLabel(["sms"])).toBe("Confirm & text");
    expect(confirmButtonLabel([])).toBe("Confirm");
    expect(notifiedPhrase(["email", "sms"])).toBe("emailed and texted");
    expect(notifiedPhrase(undefined)).toBeNull();
  });
});
