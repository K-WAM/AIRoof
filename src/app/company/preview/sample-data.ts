export const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
export const company = "RoofDoctors South Florida";
export const revenue = [
  { month: "Jun", value: 148000 }, { month: "Jul", value: 164000 },
  { month: "Aug", value: 156000 }, { month: "Sep", value: 189000 },
  { month: "Oct", value: 208000 }, { month: "Nov", value: 234000 },
];
export const customers = [
  { name: "Seaglass Property Group", jobs: 4, value: 62000 },
  { name: "Marina Court Association", jobs: 2, value: 48500 },
  { name: "Palmetto Grove Estates", jobs: 3, value: 41200 },
  { name: "Elena Rivera", jobs: 1, value: 28700 },
  { name: "Daniel Brooks", jobs: 1, value: 22600 },
];
export const jobTypes = [
  { name: "Tile re-roof", value: 105300 }, { name: "Shingle re-roof", value: 70200 },
  { name: "Flat roof", value: 35100 }, { name: "Roof repairs", value: 23400 },
];
export const aging = [
  { label: "0–30 days", value: 42000 }, { label: "31–60 days", value: 10500 }, { label: "60+ days", value: 4500 },
];
export const workers = [
  { name: "Carlos Medina", initials: "CM", role: "Foreman", crew: "Tile crew", regular: 80, overtime: 6, rate: 32, jobs: 4, missing: false },
  { name: "Luis Vega", initials: "LV", role: "Installer", crew: "Tile crew", regular: 80, overtime: 4, rate: 26, jobs: 4, missing: false },
  { name: "Mateo Cruz", initials: "MC", role: "Installer", crew: "Tile crew", regular: 76, overtime: 0, rate: 25, jobs: 3, missing: true },
  { name: "Ana Torres", initials: "AT", role: "Foreman", crew: "Shingle crew", regular: 80, overtime: 3, rate: 30, jobs: 5, missing: false },
  { name: "James Reed", initials: "JR", role: "Installer", crew: "Shingle crew", regular: 80, overtime: 2, rate: 25, jobs: 5, missing: false },
  { name: "Noah Perez", initials: "NP", role: "Roofer", crew: "Shingle crew", regular: 72, overtime: 0, rate: 24, jobs: 4, missing: false },
  { name: "Sofia Diaz", initials: "SD", role: "Repair technician", crew: "Repair crew", regular: 80, overtime: 5, rate: 28, jobs: 9, missing: false },
  { name: "Ethan Cole", initials: "EC", role: "Roofer", crew: "Repair crew", regular: 78, overtime: 0, rate: 24, jobs: 8, missing: true },
];
export const gross = (worker: typeof workers[number]) => worker.regular * worker.rate + worker.overtime * worker.rate * 1.5;
export type Permit = {
  number: string; date: string; address: string; city: string; county: string;
  type: "Re-roof" | "New roof" | "Repair"; use: "Residential" | "Commercial"; valuation: number; contractor: string | null;
};
// Entirely fictional demo records. Dates are anchored to the preview's Nov 30, 2026 snapshot.
export const permits: Permit[] = [
  { number: "DEMO-MD-260431", date: "2026-11-30", address: "1842 Seaglass Harbor Lane", city: "Miami", county: "Miami-Dade", type: "Re-roof", use: "Residential", valuation: 28500, contractor: null },
  { number: "DEMO-BR-260728", date: "2026-11-30", address: "620 Palmetto Sky Court", city: "Fort Lauderdale", county: "Broward", type: "New roof", use: "Residential", valuation: 42000, contractor: null },
  { number: "DEMO-PB-260315", date: "2026-11-29", address: "914 Coral Lantern Way", city: "Boca Raton", county: "Palm Beach", type: "Re-roof", use: "Commercial", valuation: 96000, contractor: null },
  { number: "DEMO-MD-260430", date: "2026-11-28", address: "273 Baybird Terrace", city: "Doral", county: "Miami-Dade", type: "Repair", use: "Residential", valuation: 6400, contractor: "Sample Coastal Roofing" },
  { number: "DEMO-BR-260727", date: "2026-11-27", address: "1058 Mangrove Bell Drive", city: "Hollywood", county: "Broward", type: "Re-roof", use: "Residential", valuation: 31200, contractor: null },
  { number: "DEMO-PB-260314", date: "2026-11-26", address: "460 Silver Heron Place", city: "Delray Beach", county: "Palm Beach", type: "Repair", use: "Commercial", valuation: 14500, contractor: "Sample Summit Roof Co." },
  { number: "DEMO-MD-260429", date: "2026-11-25", address: "831 Sunset Shell Avenue", city: "Miami", county: "Miami-Dade", type: "New roof", use: "Commercial", valuation: 128000, contractor: "Sample Coastal Roofing" },
  { number: "DEMO-BR-260726", date: "2026-11-24", address: "2246 Pelican Meadow Road", city: "Davie", county: "Broward", type: "Repair", use: "Residential", valuation: 4800, contractor: null },
  { number: "DEMO-PB-260313", date: "2026-11-23", address: "718 Amber Tide Circle", city: "Boynton Beach", county: "Palm Beach", type: "Re-roof", use: "Residential", valuation: 35400, contractor: "Sample Summit Roof Co." },
  { number: "DEMO-MD-260428", date: "2026-11-22", address: "391 Biscayne Fern Street", city: "Homestead", county: "Miami-Dade", type: "Re-roof", use: "Residential", valuation: 24700, contractor: null },
  { number: "DEMO-BR-260725", date: "2026-11-20", address: "550 Indigo Palm Lane", city: "Weston", county: "Broward", type: "New roof", use: "Residential", valuation: 51000, contractor: "Sample Atlantic Roofworks" },
  { number: "DEMO-PB-260312", date: "2026-11-18", address: "1620 Ocean Finch Court", city: "West Palm Beach", county: "Palm Beach", type: "New roof", use: "Commercial", valuation: 164000, contractor: null },
  { number: "DEMO-MD-260427", date: "2026-11-15", address: "905 Sandstone Cove Way", city: "Kendall", county: "Miami-Dade", type: "Repair", use: "Commercial", valuation: 18500, contractor: "Sample Coastal Roofing" },
  { number: "DEMO-BR-260724", date: "2026-11-10", address: "332 Willow Reef Place", city: "Plantation", county: "Broward", type: "Re-roof", use: "Commercial", valuation: 78000, contractor: "Sample Atlantic Roofworks" },
  { number: "DEMO-PB-260311", date: "2026-11-04", address: "2047 Morning Coral Drive", city: "Wellington", county: "Palm Beach", type: "Repair", use: "Residential", valuation: 7200, contractor: null },
];
export const daysAgo = (date: string) => Math.round((Date.UTC(2026, 10, 30) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
export const permitDate = (date: string) => `Nov ${Number(date.slice(-2))}, 2026`;
