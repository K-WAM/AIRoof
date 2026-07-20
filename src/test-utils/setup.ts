import { vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({
  getAdminFirestore: vi.fn(() => null),
}));
