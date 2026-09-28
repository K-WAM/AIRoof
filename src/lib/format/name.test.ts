import { describe, expect, it } from "vitest";
import { cleanCallerName } from "./name";

describe("cleanCallerName", () => {
  it("strips one leading filler from a spoken name", () => {
    expect(cleanCallerName("Es Carla Esnaida")).toBe("Carla Esnaida");
    expect(cleanCallerName("It's Kareem Awad")).toBe("Kareem Awad");
    expect(cleanCallerName("this is Carla")).toBe("Carla");
    expect(cleanCallerName("My name is Kareem Awad")).toBe("Kareem Awad");
    expect(cleanCallerName("me llamo Carla")).toBe("Carla");
    expect(cleanCallerName("I'm Kareem")).toBe("Kareem");
    expect(cleanCallerName("I am Kareem")).toBe("Kareem");
    expect(cleanCallerName("Soy Carla")).toBe("Carla");
  });

  it("is case-insensitive and tolerates trailing punctuation", () => {
    expect(cleanCallerName("ES CARLA")).toBe("CARLA");
    expect(cleanCallerName("Hi, es, Carla")).toBe("Hi, es, Carla");
    expect(cleanCallerName("It’s Kareem Awad")).toBe("Kareem Awad");
  });

  it("never mistakes a real name that starts with a filler for a filler", () => {
    expect(cleanCallerName("Esther Lee")).toBe("Esther Lee");
    expect(cleanCallerName("Soyla Diaz")).toBe("Soyla Diaz");
    expect(cleanCallerName("Itzel Ramos")).toBe("Itzel Ramos");
  });

  it("leaves the name unchanged when stripping would leave nothing", () => {
    expect(cleanCallerName("Es")).toBe("Es");
    expect(cleanCallerName("Soy")).toBe("Soy");
    expect(cleanCallerName("  Es  ")).toBe("Es");
  });

  it("trims whitespace and keeps everything after the first filler", () => {
    expect(cleanCallerName("  Es   Carla  ")).toBe("Carla");
    expect(cleanCallerName("Carla")).toBe("Carla");
    expect(cleanCallerName("")).toBe("");
  });
});
