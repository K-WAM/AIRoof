import { describe, expect, it } from "vitest";
import { dropUnspokenTimes, mentionsATime } from "./spokenTimes";

const parsed = (arrival?: string, departure?: string, hours?: number) => ({
  labor: [{ description: "Kevin", ...(arrival ? { arrivalTime: arrival } : {}), ...(departure ? { departureTime: departure } : {}), ...(hours ? { hours } : {}) }],
  other: 1,
});

describe("mentionsATime", () => {
  it("recognises digits, am/pm, spelled-out hours and day parts in English and Spanish", () => {
    for (const text of ["we got there at 8", "arrived 8 AM", "left at four", "a las ocho", "llegué en la mañana", "at noon", "about 3:30 p.m.", "eight o'clock", "this afternoon"]) {
      expect(mentionsATime(text), text).toBe(true);
    }
  });

  it("does not see a time in plain arrival talk", () => {
    for (const text of ["Hola, soy Kevin. Están aquí en el job site. We just arrived.", "Hey, we are on site now", "Marco is here"]) {
      expect(mentionsATime(text), text).toBe(false);
    }
  });

  it("does not mistake words that merely contain 'am' or 'pm' for a time", () => {
    expect(mentionsATime("the ramp is damaged")).toBe(false);
  });
});

describe("dropUnspokenTimes", () => {
  // The owner's real case: Kevin never said a time, the model answered 08:00.
  it("removes an invented arrival time when the transcript has no time in it", () => {
    const out = dropUnspokenTimes(parsed("08:00"), "Hola, soy Kevin. Están aquí en el job site. We just arrived.");
    expect(out.labor[0]).toEqual({ description: "Kevin" });
    expect(out.other).toBe(1); // everything else is untouched
  });

  it("keeps times the speaker really said", () => {
    const said = parsed("08:00");
    expect(dropUnspokenTimes(said, "Hey, this is Marco, just got to the job site, it's like 8am.")).toBe(said);
    expect(dropUnspokenTimes(parsed(undefined, "16:00"), "salimos a las cuatro").labor[0].departureTime).toBe("16:00");
  });

  it("keeps stated hours (only clock times are guarded)", () => {
    const out = dropUnspokenTimes(parsed("08:00", "16:00", 8), "Kevin worked a full day");
    expect(out.labor[0]).toEqual({ description: "Kevin", hours: 8 });
  });

  it("is a no-op when there are no times to drop, and never mutates its input", () => {
    const plain = parsed();
    expect(dropUnspokenTimes(plain, "we arrived")).toBe(plain);
    const withTime = parsed("08:00");
    dropUnspokenTimes(withTime, "we arrived");
    expect(withTime.labor[0].arrivalTime).toBe("08:00");
  });
});
