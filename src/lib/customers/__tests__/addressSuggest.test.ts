import { describe, expect, it } from "vitest";
import { suggestAddresses, filterAddressSuggestions, indexOfAddress, ADDRESS_SUGGESTIONS_MAX } from "@/lib/customers/addressSuggest";

const properties = [
  { name: "Northside Plaza", address: "10 Example Way", city: "Miami", state: "FL" },
  { name: "South Campus", address: "20 Example Way", city: "Miami", state: "FL" },
];

describe("suggestAddresses", () => {
  it("orders past job addresses most recent first, then the customer's own address, then saved properties", () => {
    const list = suggestAddresses({
      jobAddresses: ["300 Newest Road", "100 Older Road"],
      customerAddress: "50 Billing Office Road",
      properties,
    });
    expect(list.map((s) => s.address)).toEqual([
      "300 Newest Road",
      "100 Older Road",
      "50 Billing Office Road",
      "10 Example Way",
      "20 Example Way",
    ]);
  });

  it("de-duplicates the same address regardless of case, punctuation and extra spaces", () => {
    const list = suggestAddresses({
      jobAddresses: ["10 example way"],
      customerAddress: "10  Example   Way",
      properties: [{ address: "10 Example Way,", city: "Miami" }],
    });
    expect(list).toHaveLength(1);
    expect(list[0].address).toBe("10 example way");
  });

  it("keeps addresses in different cities distinct", () => {
    const list = suggestAddresses({
      properties: [
        { address: "1 Main St", city: "Miami", state: "FL" },
        { address: "1 Main St", city: "Hialeah", state: "FL" },
      ],
    });
    expect(list.map((s) => s.city)).toEqual(["Miami", "Hialeah"]);
  });

  it("matches accents either way — typing Jose finds Jose and José alike", () => {
    const suggestFrom = (query: string) => suggestAddresses({
      properties: [
        { name: "José Martínez", address: "40 José Avenue", city: "Hialeah" },
        { name: "Jose Plaza", address: "41 Jose Road", city: "Hialeah" },
      ],
      query,
    });
    expect(suggestFrom("jose").map((s) => s.address)).toEqual(["40 José Avenue", "41 Jose Road"]);
    // Querying with the accent also finds the unaccented spelling.
    expect(suggestFrom("josé").map((s) => s.address)).toEqual(["40 José Avenue", "41 Jose Road"]);
  });

  it("filters by any word order and ignores punctuation", () => {
    const result = suggestAddresses({ properties, query: "way example 20" });
    expect(result.map((s) => s.address)).toEqual(["20 Example Way"]);
    expect(suggestAddresses({ properties, query: "20-example" }).map((s) => s.address)).toEqual(["20 Example Way"]);
  });

  it("treats an empty query as 'everything', so the list can open on focus", () => {
    expect(suggestAddresses({ properties, query: "   " })).toHaveLength(2);
  });

  it("returns nothing when the customer has no known addresses", () => {
    expect(suggestAddresses({ query: "main" })).toEqual([]);
  });

  it("caps the list at 8", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ address: `${i + 1} Test Street` }));
    expect(suggestAddresses({ properties: many })).toHaveLength(ADDRESS_SUGGESTIONS_MAX);
  });

  it("skips blank addresses and carries the property name/city/state through", () => {
    const list = suggestAddresses({ properties: [{ address: "  " }, ...properties] });
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ name: "Northside Plaza", city: "Miami", state: "FL" });
  });
});

describe("filterAddressSuggestions", () => {
  it("filters an existing list and caps at 8", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ address: `${i + 1} Test Street` }));
    expect(filterAddressSuggestions(many, "")).toHaveLength(ADDRESS_SUGGESTIONS_MAX);
    expect(filterAddressSuggestions(many, "street 12").map((s) => s.address)).toEqual(["12 Test Street"]);
  });

  it("offers every address when the field already holds one of them (a filled-in customer address is not a search)", () => {
    const school = [
      { address: "316 School Test Road" },
      { address: "101 Lakeview Drive", city: "Coral Springs", name: "Lakeview Elementary" },
      { address: "202 Panther Way", city: "Coral Springs" },
    ];
    expect(filterAddressSuggestions(school, "316 School Test Road").map((s) => s.address)).toEqual(["316 School Test Road", "101 Lakeview Drive", "202 Panther Way"]);
    expect(filterAddressSuggestions(school, " 101 lakeview drive ").map((s) => s.address)).toHaveLength(3);
    expect(filterAddressSuggestions(school, "316 School").map((s) => s.address)).toEqual(["316 School Test Road"]);
    expect(indexOfAddress(school, "202 PANTHER WAY")).toBe(2);
    expect(indexOfAddress(school, "")).toBe(-1);
    const many = Array.from({ length: 12 }, (_, i) => ({ address: `${i + 1} Test Street` }));
    const shown = filterAddressSuggestions(many, "12 Test Street");
    expect(shown).toHaveLength(ADDRESS_SUGGESTIONS_MAX);
    expect(shown.map((s) => s.address)).toContain("12 Test Street");
  });

  it("a recent job at a saved property keeps its place but shows the property's name and city", () => {
    const out = suggestAddresses({
      jobAddresses: ["101 Lakeview Drive"],
      customerAddress: "316 School Test Road",
      properties: [
        { name: "Lakeview Elementary", address: "101 Lakeview Drive", city: "Coral Springs", state: "FL" },
        { name: "Lakeview Annex", address: "101 Lakeview Drive", city: "Parkland", state: "FL" },
      ],
    });
    expect(out).toEqual([
      { address: "101 Lakeview Drive", city: "Coral Springs", state: "FL", name: "Lakeview Elementary" },
      { address: "316 School Test Road" },
      { address: "101 Lakeview Drive", city: "Parkland", state: "FL", name: "Lakeview Annex" },
    ]);
  });
});
