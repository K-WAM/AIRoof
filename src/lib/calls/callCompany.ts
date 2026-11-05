// Which billing company a phone call belongs to (T-317), from the caller's own customer record. Mirrors the
// returning-caller match (src/lib/voice/returningCaller.ts): the EXACT caller-ID number (last 10 digits) against the
// customers' phone search tokens, latest customer first. Only a non-default company is returned, so single-company
// businesses and everyday (default) calls keep today's call-document shape.

import type { Firestore } from "firebase-admin/firestore";
import { isMultiCompany } from "@/lib/companies/companies";
import { nonDefaultCompanyId } from "@/lib/business/companyAttribution";

type Doc = Record<string, unknown>;

export async function findCallingCustomerCompanyId(
  db: Pick<Firestore, "collection">,
  businessId: string,
  callerPhone: string | null | undefined,
): Promise<string | null> {
  const raw = typeof callerPhone === "string" ? callerPhone.trim() : "";
  const digits = raw.replace(/\D/g, "");
  if (!raw || digits.length < 7) return null;
  const caller10 = digits.slice(-10);
  const business = db.collection("businesses").doc(businessId);
  const bizSnap = await business.get();
  if (!bizSnap.exists) return null;
  const businessData = bizSnap.data();
  if (!isMultiCompany(businessData)) return null;

  const customerSnap = await business
    .collection("customers")
    .where("searchTokens", "array-contains", caller10.slice(-7))
    .limit(5)
    .get();
  const customer = customerSnap.docs
    .map((doc) => doc.data() as Doc)
    .filter((data) => last10(str(data.phone)) === caller10)
    .sort((a, b) => num(b.lastJobAt) - num(a.lastJobAt))[0];
  return customer ? nonDefaultCompanyId(businessData, customer.companyId) : null;
}

function last10(value: string | undefined): string | undefined {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
