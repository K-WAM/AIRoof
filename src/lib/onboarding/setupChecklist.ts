import type { BusinessModules } from "@/hooks/useBusinessModules";
import type { VerticalVocab } from "@/lib/verticals/templates";
export type SetupItem = { id: "phone" | "prices" | "resource" | "logo" | "team" | "testCall"; label: string; done: boolean; href?: string; cta?: string };
export type SetupChecklistInput = { phoneConfigured: boolean; prices: number; resources: number; hasLogo: boolean; teamMembers: number; calls: number; phoneNumber?: string };
export function setupChecklist(input: SetupChecklistInput, modules: Pick<BusinessModules, "isEnabled">, vocab: VerticalVocab): SetupItem[] {
 const items: SetupItem[] = [{ id:"phone", label: input.phoneConfigured ? "Your phone line is connected" : "Luxor is connecting your line", done: input.phoneConfigured }];
 if (modules.isEnabled("pricing")) items.push({ id:"prices", label:"Add your prices", done:input.prices>0, href:"/company/library?section=pricing", cta:"Add prices" });
 items.push({ id:"resource", label:`Add your first ${vocab.resourceNoun.toLowerCase()}`, done:input.resources>0, href:"/company/library?section=crews", cta:`Add ${vocab.resourceNoun.toLowerCase()}` }, { id:"logo", label:"Upload your logo", done:input.hasLogo, href:"/company/library?section=branding", cta:"Upload logo" }, { id:"team", label:"Invite your team", done:input.teamMembers>=2, href:"/company/team", cta:"Invite someone" }, { id:"testCall", label:"Make a test call", done:input.calls>0, href:input.phoneNumber ? `tel:${input.phoneNumber}` : undefined, cta:input.phoneNumber ? "Call your line" : undefined });
 return items;
}
