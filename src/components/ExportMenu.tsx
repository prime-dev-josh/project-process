import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placePortaledMenu, portaledMenuListClass, portaledMenuShellClass, type PortaledMenuPos } from "../lib/dropdownPortal";
import { cx, headerBtn } from "../styles";

export type ExportKind = "json" | "csv" | "flowchart" | "docs";

type Props = {
  onExport: (kind: ExportKind) => void;
};

const OPTIONS: { id: ExportKind; title: string; hint: string }[] = [
  { id: "csv", title: "Full CSV", hint: "Map and group hierarchy" },
  { id: "flowchart", title: "Flowchart PDF", hint: "Branded charts, one group at a time" },
  { id: "docs", title: "Documentation PDF", hint: "Branded report with contents" },
  { id: "json", title: "JSON", hint: "Full map file" },
];

export default function ExportMenu({ onExport }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<PortaledMenuPos | null>(null);

  function placeMenu() {
    if (!rootRef.current) return;
    const pos = placePortaledMenu(rootRef.current, 280);
    setMenuPos({ ...pos, width: Math.max(pos.width, 260) });
  }

  function close() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    placeMenu();
    const onReposition = () => placeMenu();
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={headerBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) close();
          else {
            placeMenu();
            setOpen(true);
          }
        }}
      >
        Export
      </button>
      {open && menuPos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className={portaledMenuShellClass}
              style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width, maxHeight: menuPos.maxHeight }}
              role="menu"
              aria-label="Export"
            >
              <ul className={cx(portaledMenuListClass, "max-h-none")}>
                {OPTIONS.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full cursor-pointer flex-col gap-0.5 rounded-md border-0 bg-transparent px-2 py-1.5 text-left hover:bg-[var(--hover)]"
                      onClick={() => {
                        close();
                        onExport(option.id);
                      }}
                    >
                      <span className="text-[13px] font-semibold text-[var(--text)]">{option.title}</span>
                      <span className="text-[11px] leading-snug text-[var(--muted)]">{option.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
