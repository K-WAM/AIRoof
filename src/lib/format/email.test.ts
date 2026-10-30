import { describe, expect, it } from "vitest";
import { joinSpelledEmails, tidyEmail } from "./email";

describe("joinSpelledEmails", () => {
  it("joins a dashed, letter-by-letter address", () => {
    expect(joinSpelledEmails("k-w-a-m-w-a-d@gmail.com")).toBe("kwamwad@gmail.com");
    expect(joinSpelledEmails("K-W-A-M-W-A-D@gmail.com")).toBe("kwamwad@gmail.com");
  });

  it("joins the spoken form inside a call summary and leaves the rest of the sentence alone", () => {
    expect(joinSpelledEmails("The email address K-W-A-M-W-A-D at gmail dot com was confirmed."))
      .toBe("The email address kwamwad@gmail.com was confirmed.");
    expect(joinSpelledEmails("Confirmed (K-W-A-M-W-A-D@gmail.com) and a contact number (510-453-7871)."))
      .toBe("Confirmed (kwamwad@gmail.com) and a contact number (510-453-7871).");
  });

  it("never touches ordinary addresses, hyphenated names or phone numbers", () => {
    expect(joinSpelledEmails("mary-jo.smith@acme-roofing.com")).toBe("mary-jo.smith@acme-roofing.com");
    expect(joinSpelledEmails("Call 510-453-7871 or 4-5-6")).toBe("Call 510-453-7871 or 4-5-6");
    expect(joinSpelledEmails("a-b@x.com")).toBe("a-b@x.com"); // two letters is not a spelling
  });
});

describe("tidyEmail", () => {
  it("cleans stored values and drops empties", () => {
    expect(tidyEmail("  k-w-a-m-w-a-d@gmail.com ")).toBe("kwamwad@gmail.com");
    expect(tidyEmail("owner@roofing.com")).toBe("owner@roofing.com");
    expect(tidyEmail("   ")).toBeUndefined();
    expect(tidyEmail(undefined)).toBeUndefined();
    expect(tidyEmail(42)).toBeUndefined();
  });
});
