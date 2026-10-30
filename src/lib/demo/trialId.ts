// The one definition of a private browser-demo tenant id. Kept dependency-free so the phone booking tool can use it
// without importing the trial machinery (roofingTrial.ts re-exports it).
export function isTrialBusiness(id: string): boolean { return /^demo-trial-roofing-[a-f0-9]{32}$/.test(id); }
