import { Resend } from "resend";
import { getCapabilityStatus, requireEnv } from "@/lib/config/env";
import {
  claimOperation,
  completeOperationAttempt,
  createEmailOperationId,
  startOperationAttempt,
} from "@/lib/ops/ledger";
import type { Firestore } from "firebase-admin/firestore";

export type NotificationDeliveryState =
  | "delivered"
  | "failed"
  | "pending"
  | "unconfigured";

export interface CommSendResult {
  status: NotificationDeliveryState | "no_recipient";
  providerId?: string;
  failureCode?: string;
  failureClassification?: "retryable" | "terminal";
}

export function isCommsConfigured(): boolean {
  return getCapabilityStatus("resend") === "configured";
}

function classifyResendError(statusCode: number): {
  classification: "retryable" | "terminal";
  code: string;
} {
  if (statusCode >= 500 || statusCode === 429) {
    return { classification: "retryable", code: `provider_${statusCode}` };
  }
  if (statusCode >= 400) {
    return { classification: "terminal", code: `provider_${statusCode}` };
  }
  return { classification: "retryable", code: "provider_rejected" };
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<CommSendResult> {
  if (!isCommsConfigured()) {
    return { status: "unconfigured" };
  }
  if (!opts.to) {
    return { status: "no_recipient" };
  }

  const from = requireEnv("RESEND_FROM");
  const apiKey = requireEnv("RESEND_API_KEY");
  const resend = new Resend(apiKey);

  try {
    const delivery = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });

    if (delivery.error) {
      const sc = delivery.error.statusCode ?? 0;
      const classification = classifyResendError(sc);
      return {
        status: "failed",
        failureCode: classification.code,
        failureClassification: classification.classification,
      };
    }

    if (!delivery.data?.id) {
      return {
        status: "failed",
        failureCode: "no_provider_id",
        failureClassification: "retryable",
      };
    }

    return { status: "delivered", providerId: delivery.data.id };
  } catch {
    return {
      status: "failed",
      failureCode: "provider_error",
      failureClassification: "retryable",
    };
  }
}

export async function sendWithLedger(opts: {
  firestore: Firestore;
  businessId: string;
  to: string;
  subject: string;
  html: string;
  messageType: string;
  entityId: string;
  entityRef: { collection: string; id: string };
}): Promise<NotificationDeliveryState> {
  if (!isCommsConfigured()) {
    return "unconfigured";
  }
  if (!opts.to) {
    return "failed";
  }

  const opId = createEmailOperationId(opts.messageType, opts.entityId);

  const claim = await claimOperation(
    {
      businessId: opts.businessId,
      opId,
      kind: "email",
      entityRef: opts.entityRef,
    },
    { firestore: opts.firestore },
  );

  if (!claim.claimed && claim.operation.state === "succeeded") return "delivered";
  if (!claim.claimed && claim.operation.state === "pending") return "pending";
  if (
    !claim.claimed &&
    claim.operation.lastFailure?.classification !== "retryable"
  ) {
    return "failed";
  }

  const attempt = await startOperationAttempt(
    { businessId: opts.businessId, opId },
    { firestore: opts.firestore },
  );

  const result = await sendEmail({
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });

  if (result.status === "delivered") {
    await completeOperationAttempt(
      {
        businessId: opts.businessId,
        opId,
        attemptId: attempt.attemptId,
        state: "succeeded",
        providerId: result.providerId,
      },
      { firestore: opts.firestore },
    );
    return "delivered";
  }

  const failureCode =
    result.status === "unconfigured"
      ? "configuration_missing"
      : result.status === "no_recipient"
        ? "no_recipient"
        : result.failureCode ?? "unknown";

  const failureClassification =
    result.status === "unconfigured" || result.status === "no_recipient"
      ? "terminal"
      : result.failureClassification ?? "retryable";

  await completeOperationAttempt(
    {
      businessId: opts.businessId,
      opId,
      attemptId: attempt.attemptId,
      state: "failed",
      failure: { classification: failureClassification, code: failureCode },
    },
    { firestore: opts.firestore },
  );

  if (result.status === "unconfigured") return "unconfigured";
  return "failed";
}
