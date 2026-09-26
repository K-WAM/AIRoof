"use client";

import { Toggle } from "@/components/ui/Toggle";
import { OPTION_COPY, OPTIONS_SUBHEADING, type OptionKey } from "@/lib/documents/optionsCopy";

/**
 * The three customer-copy switches (hide materials / hide labor / show technicians), each with its one-line
 * explanation. Shared by the Quote, Invoice and Report so they read — and behave — the same.
 */
export function DocumentOptionToggles({ values, onChange, disabled = false, keys = ["hideMaterials", "hideLabor", "showTechnicians"], showSubheading = true, disabledKeys = {} }: {
  values: Partial<Record<OptionKey, boolean>>;
  onChange: (key: OptionKey, next: boolean) => void;
  disabled?: boolean;
  keys?: OptionKey[];
  showSubheading?: boolean;
  /** Options that can't be switched on right now, each with the reason shown in place of its hint. (A switch that is already ON can still be turned off.) */
  disabledKeys?: Partial<Record<OptionKey, string>>;
}) {
  return (
    <div className="no-print" style={{ display: "grid", gap: 10 }}>
      {showSubheading && <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>{OPTIONS_SUBHEADING}</p>}
      {keys.map((key) => {
        const reason = disabledKeys[key];
        const blocked = disabled || (!!reason && values[key] !== true);
        return (
          <label key={key} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: blocked ? "not-allowed" : "pointer" }}>
            <Toggle checked={values[key] === true} onChange={(next) => onChange(key, next)} label={OPTION_COPY[key].label} disabled={blocked} size="sm" />
            <span style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>{OPTION_COPY[key].label}</strong>
              <br />
              <small style={{ color: "var(--text-muted)" }}>{reason && values[key] !== true ? reason : OPTION_COPY[key].hint}</small>
            </span>
          </label>
        );
      })}
    </div>
  );
}
