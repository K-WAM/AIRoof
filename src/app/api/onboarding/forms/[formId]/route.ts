import type { NextRequest } from "next/server";
import { readForm, writeForm } from "@/lib/onboarding/publicForms";
import { routeError } from "@/lib/onboarding/http";
type Context = { params: Promise<{ formId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  try { return await readForm(request, (await params).formId); }
  catch (error) { return routeError(error); }
}
export async function PUT(request: NextRequest, { params }: Context) {
  try { return await writeForm(request, (await params).formId, false); }
  catch (error) { return routeError(error); }
}
