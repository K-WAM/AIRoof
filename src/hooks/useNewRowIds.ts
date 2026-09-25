import { useRef, useState } from "react";

/** Tracks only rows introduced after an initial successful list load. */
export function useNewRowIds<T>(idOf: (item: T) => string) {
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  return {
    newIds,
    track(items: T[]) {
      const ids = items.map(idOf);
      if (initialized.current) {
        const fresh = ids.filter((id) => !seen.current.has(id));
        setNewIds(new Set(fresh));
        if (fresh.length) window.setTimeout(() => setNewIds(new Set()), 1800);
      }
      seen.current = new Set(ids);
      initialized.current = true;
    },
  };
}
