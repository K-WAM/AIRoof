import { userTypeDef } from "@/lib/team/userTypes";

// Six entry choices, using the same role/trade presets as the Team screen.
export const VIEW_AS_TYPES = [
  { ...userTypeDef("admin"), id: "owner", label: "Owner" },
  userTypeDef("office"),
  userTypeDef("inspector"),
  userTypeDef("technician"),
  { ...userTypeDef("technician"), id: "crew", label: "Field crew", trade: undefined },
  userTypeDef("viewer"),
];

export interface ViewAsProfile {
  label: string;
  businessId: string;
  businessName: string;
  expiresAt: number;
}
