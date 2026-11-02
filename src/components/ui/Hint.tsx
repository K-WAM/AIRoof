"use client";

import { useEffect, useId, useRef, useState } from "react";

/** A small explanation: hover/focus, or tap. Escape and tapping elsewhere dismiss it. */
export function Hint({ label, children }: { label: string; children: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  function show() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)),
      top: rect.bottom + 150 > window.innerHeight ? Math.max(8, rect.top - 140) : rect.bottom + 8 });
  }
  useEffect(() => {
    if (!position) return;
    const pointer = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node)) setPosition(null); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setPosition(null); } };
    const close = () => setPosition(null);
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", close);
    return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", key, true); window.removeEventListener("resize", close); };
  }, [position]);
  return <>
    <button ref={trigger} type="button" className="help-hint" aria-label={`${label} help`} aria-expanded={!!position}
      aria-describedby={position ? id : undefined} onMouseEnter={show} onMouseLeave={() => setPosition(null)}
      onFocus={show} onBlur={() => setPosition(null)} onClick={show}>?</button>
    {position && <span role="tooltip" id={id} className="help-hint-content" style={position}>{children}</span>}
  </>;
}
