"use client";

import { Plus } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { useQuickAdd } from "@/contexts/QuickAddContext";

/**
 * The global "+" — reachable from every company page (sidebar footer on
 * desktop, the mobile topbar as an icon). Opens the quick-add picker; always
 * available regardless of which page you're on, so creating a job/resource/
 * teammate never requires navigating there first.
 */
export function QuickAddButton({ variant = "full" }: { variant?: "full" | "icon" }) {
  const { openMenu } = useQuickAdd();

  if (variant === "icon") {
    return (
      <Tooltip content="Quick add">
        <button type="button" className="mobile-menu-btn" aria-label="Quick add" onClick={openMenu}>
          <Plus size={18} strokeWidth={1.75} />
        </button>
      </Tooltip>
    );
  }

  return (
    <button type="button" className="quickadd-trigger" onClick={openMenu}>
      <Plus size={15} strokeWidth={1.75} />
      Add
    </button>
  );
}
