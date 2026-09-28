// Phase 31 (T-152): time blocks — an inspector (or the office) blocks time on an
// inspector/crew row so the AI never books into it. Stored one doc per block at
// businesses/{bid}/timeBlocks/{blockId}; see GET|POST|DELETE /api/company/time-blocks.

export interface TimeBlock {
  blockId: string;
  businessId: string;
  /** The crew/inspector row this block belongs to. */
  crewId: string;
  /** Block start, ms epoch. */
  startTime: number;
  /** Block end, ms epoch (always after startTime). */
  endTime: number;
  /** Short reason shown on the calendar ("site visit — St. Mary's", "materials pickup"). */
  label: string;
  /** The office user (or inspector login) who created the block. */
  createdByUid: string;
  createdAt: number;
}

/** Firestore collection path for a business's time blocks. */
export function timeBlocksPath(businessId: string): string {
  return `businesses/${businessId}/timeBlocks`;
}
