export type RequestReviewEntity = { callerPhone?: string; callerEmail?: string; address?: string; serviceRequested?: string; serviceType?: string; intake?: Record<string, string> };

/** Pure queue signal shared by lead and appointment review surfaces. */
export function missingRequestInformation(request: RequestReviewEntity): string[] {
  return [
    !request.callerPhone?.trim() && "phone",
    !request.address?.trim() && "address",
    !(request.serviceRequested ?? request.serviceType)?.trim() && "service",
  ].filter((field): field is string => Boolean(field));
}

export function isNewRequest(status: string): boolean { return status === "new" || status === "requested"; }
