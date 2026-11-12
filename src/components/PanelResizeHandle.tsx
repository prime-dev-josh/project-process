import { useEffect, useRef, useState } from "react";
import { clampPanelWidth } from "../lib/panelWidths";
import { cx } from "../styles";

type Props = {
  /** Which side of the viewport the panel is docked on. */
  side: "left" | "right";
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (width: number) => void;
  onCommit: (width: number) => void;
  onReset?: () => void;
};

export default function PanelResizeHandle({ side, value, min, max, label, onChange, onCommit, onReset }: Props) {
  const drag = useRef<{ pointerId: number; startX: number; startW: number } | null>(null);
  const [active, setActive] = useState(false);
  const latest = useRef({ value, min, max, side, onChange, onCommit });
  latest.current = { value, min, max, side, onChange, onCommit };

  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    document.body.classList.add("is-panel-resizing");
    return () => {
      document.body.style.cursor = previous;
      document.body.classList.remove("is-panel-resizing");
    };
  }, [active]);

  function widthFrom(clientX: number, startX: number, startW: number) {
    const delta = clientX - startX;
    const raw = latest.current.side === "left" ? startW + delta : startW - delta;
    return clampPanelWidth(raw, latest.current.min, latest.current.max);
  }

  return (
    <div
      className={cx(
        "panel-resize group/resize absolute top-0 z-20 flex h-full w-3 cursor-col-resize touch-none items-center justify-center",
        side === "left" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2",
      )}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startW: value };
        event.currentTarget.setPointerCapture(event.pointerId);
        setActive(true);
      }}
      onPointerMove={(event) => {
        const session = drag.current;
        if (!session || event.pointerId !== session.pointerId) return;
        onChange(widthFrom(event.clientX, session.startX, session.startW));
      }}
      onPointerUp={(event) => {
        const session = drag.current;
        if (!session || event.pointerId !== session.pointerId) return;
        drag.current = null;
        setActive(false);
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          /* already released */
        }
        onCommit(widthFrom(event.clientX, session.startX, session.startW));
      }}
      onPointerCancel={() => {
        const session = drag.current;
        drag.current = null;
        setActive(false);
        if (session) onCommit(latest.current.value);
      }}
      onDoubleClick={() => onReset?.()}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 32 : 12;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const dir = event.key === "ArrowRight" ? 1 : -1;
          const signed = side === "left" ? dir : -dir;
          onCommit(value + signed * step);
        }
        if (event.key === "Home") {
          event.preventDefault();
          onCommit(min);
        }
        if (event.key === "End") {
          event.preventDefault();
          onCommit(max);
        }
        if (event.key === "Enter" && onReset) {
          event.preventDefault();
          onReset();
        }
      }}
    >
      <span
        className={cx(
          "pointer-events-none h-12 w-1 rounded-full bg-[var(--line)] transition-[background-color,height,width] group-hover/resize:h-16 group-hover/resize:w-1.5 group-hover/resize:bg-[var(--accent)]",
          active && "h-16 w-1.5 bg-[var(--accent)]",
        )}
        aria-hidden
      />
    </div>
  );
}
