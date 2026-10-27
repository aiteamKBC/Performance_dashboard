import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface HeaderTipProps {
  label: ReactNode;
  title: string;
  children: ReactNode;
}

// Column header with an explanation on hover / focus. The tooltip is portalled
// to <body> with fixed positioning so the table's scroll container can't clip it.
export default function HeaderTip({ label, title, children }: HeaderTipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const half = 150; // half the tooltip width, kept inside the viewport
    const x = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
    setPos({ x, y: r.bottom + 8 });
  };
  const hide = () => setPos(null);

  return (
    <>
      <span
        tabIndex={0}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={hide}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={hide}
        style={{ outline: "none" }}
      >
        {label}
      </span>
      {pos && createPortal(
        <div
          role="tooltip"
          style={{
            position: "fixed", left: pos.x, top: pos.y, transform: "translateX(-50%)",
            width: 300, zIndex: 1000, pointerEvents: "none",
            background: "var(--color-surface)", border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-raised)",
            padding: "var(--space-3)", textAlign: "left", textTransform: "none", letterSpacing: "normal",
            fontSize: "var(--text-xs)", fontWeight: "var(--font-normal)", lineHeight: 1.5,
            color: "var(--color-text-secondary)",
          }}
        >
          <div style={{ fontWeight: "var(--font-semibold)", color: "var(--color-text-primary)", marginBottom: 4 }}>{title}</div>
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
