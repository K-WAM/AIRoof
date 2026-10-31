import { redirect } from "next/navigation";
import { LEGAL_PATHS } from "@/lib/legal/version";

export default function LegalIndex() {
  redirect(LEGAL_PATHS.terms);
}
