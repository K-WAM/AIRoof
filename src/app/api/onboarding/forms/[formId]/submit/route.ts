import type { NextRequest } from "next/server";
import { writeForm } from "@/lib/onboarding/publicForms";
import { routeError } from "@/lib/onboarding/http";
export async function POST(request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
  try { return await writeForm(request, (await params).formId, true); }
  catch (error) { return routeError(error); }
}
