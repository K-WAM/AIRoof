"use client";

import { Modal } from "@/components/ui/Modal";
import { RequestReviewCard, type ReviewCall, type ReviewRequest } from "@/components/requests/RequestReviewCard";
import type { RequestDeclineReason } from "@/lib/comms/requestDeclineEmail";

export function RequestReviewDialog(props: {
  open: boolean;
  onClose: () => void;
  request: ReviewRequest | null;
  call?: ReviewCall;
  timeZone?: string;
  smsEnabled?: boolean;
  intakeLabelFor: (key: string) => string;
  jobNoun: string;
  canCreateJob: boolean;
  onAccept: () => Promise<void>;
  onDecline: (reason: RequestDeclineReason, customMessage?: string) => Promise<void>;
  onCallBack?: () => Promise<void>;
}) {
  const { open, onClose, request, ...cardProps } = props;
  return <Modal open={open && !!request} onClose={onClose} title="Review request">
    {request && <RequestReviewCard request={request} {...cardProps} />}
  </Modal>;
}
