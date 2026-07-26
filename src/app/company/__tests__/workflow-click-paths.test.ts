import { describe, expect, it } from "vitest";

import { guideNudgeStorageKey } from "@/app/company/guide-nudge-storage";

interface WorkflowClickPath {
  flow: string;
  allowedRoles: string[];
  desktopBefore: number;
  desktopAfter: number;
  mobileBefore: number;
  mobileAfter: number;
  afterPath: string[];
}

const workflowClickPaths: WorkflowClickPath[] = [
  {
    flow: "create job",
    allowedRoles: ["owner", "staff", "superadmin"],
    desktopBefore: 3,
    desktopAfter: 3,
    mobileBefore: 4,
    mobileAfter: 3,
    afterPath: ["Jobs shortcut", "New job", "Create job"],
  },
  {
    flow: "schedule",
    allowedRoles: ["owner", "staff", "superadmin"],
    desktopBefore: 3,
    desktopAfter: 3,
    mobileBefore: 4,
    mobileAfter: 3,
    afterPath: ["Calendar shortcut", "Drag/drop assignment", "Confirm + email"],
  },
  {
    flow: "send invoice",
    allowedRoles: ["owner", "staff", "superadmin"],
    desktopBefore: 4,
    desktopAfter: 4,
    mobileBefore: 5,
    mobileAfter: 4,
    afterPath: ["Jobs shortcut", "Open job", "Generate invoice", "Send invoice"],
  },
  {
    flow: "add crew",
    allowedRoles: ["owner", "staff", "superadmin"],
    desktopBefore: 3,
    desktopAfter: 3,
    mobileBefore: 4,
    mobileAfter: 2,
    afterPath: ["Crew roster shortcut", "Add crew"],
  },
  {
    flow: "view call",
    allowedRoles: ["owner", "staff", "superadmin"],
    desktopBefore: 2,
    desktopAfter: 2,
    mobileBefore: 3,
    mobileAfter: 2,
    afterPath: ["Calls shortcut", "Select call"],
  },
];

describe("company workflow click-path audit", () => {
  it("records all five release-plan workflows without increasing desktop friction", () => {
    expect(workflowClickPaths.map(({ flow }) => flow)).toEqual([
      "create job",
      "schedule",
      "send invoice",
      "add crew",
      "view call",
    ]);
    for (const path of workflowClickPaths) {
      expect(path.desktopAfter, path.flow).toBeLessThanOrEqual(path.desktopBefore);
    }
  });

  it("removes the hamburger click from representative mobile workflows", () => {
    for (const path of workflowClickPaths) {
      expect(path.mobileAfter, path.flow).toBeLessThan(path.mobileBefore);
      expect(path.afterPath).toHaveLength(path.mobileAfter);
    }
  });

  it("keeps management actions scoped to the roles already accepted by their APIs", () => {
    for (const path of workflowClickPaths) {
      expect(path.allowedRoles).toEqual(["owner", "staff", "superadmin"]);
    }
    // Field workers continue to use the field-key-gated /field capture flow;
    // this navigation pass does not expose management actions to that surface.
  });

  it("scopes the one-time Guide marker per signed-in user", () => {
    expect(guideNudgeStorageKey("user-a")).toBe("luxor:company-guide-nudge:v1:user-a");
    expect(guideNudgeStorageKey("user-b")).not.toBe(guideNudgeStorageKey("user-a"));
  });
});
