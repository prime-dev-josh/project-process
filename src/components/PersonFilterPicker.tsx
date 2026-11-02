import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { users } from "../data/users";
import { personAssignmentStats } from "../graph/workflowStatus";
import { placePortaledMenu, portaledMenuListClass, portaledMenuShellClass, type PortaledMenuPos } from "../lib/dropdownPortal";
import { handleOverlayWheel } from "../lib/overlayScroll";
import { cx, field } from "../styles";
import type { ColorBy, GraphNode } from "../types";
import PersonFace from "./PersonFace";

type Props = {
  nodes: GraphNode[];
  colorBy: ColorBy;
  selected: string | null;
  onChange: (email: string | null) => void;
};

function UnassignedMark() {
  return (
    <span className="inline-flex size-full items-center justify-center rounded-full bg-[var(--input)] text-[var(--muted)]" aria-hidden>
      <svg className="size-3.5" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4" fill="currentColor" />
        <path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="currentColor" />
      </svg>
    </span>
  );
}

export default function PersonFilterPicker({ nodes, colorBy, selected, onChange }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPos, setMenuPos] = useState<PortaledMenuPos | null>(null);

  const closed = useMemo(() => {
    if (selected === "__unassigned__") {
      return { title: "Unassigned", hint: "No assignee" };
    }
    if (selected) {
      const user = users.find((u) => u.email.toLowerCase() === selected.toLowerCase());
      if (user) {
        const { total, pct } = personAssignmentStats(nodes, colorBy, user.email);
        return { title: user.name, hint: `${pct}% done · ${total} assigned` };
      }
    }
    return { title: "All people", hint: "Show every assignee" };
  }, [selected, nodes, colorBy]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = users.filter((user) => {
      if (!q) return true;
      return user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q);
    });
    const showUnassigned = !q || "unassigned".includes(q);
    return { list, showUnassigned };
  }, [query]);

  function placeMenu() {
    if (!rootRef.current) return;
    setMenuPos(placePortaledMenu(rootRef.current));
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (!open) return;
    placeMenu();
    searchRef.current?.focus();
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onReposition = () => placeMenu();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={cx(
          field,
          "flex w-full cursor-pointer items-center gap-2 py-1.5 text-left",
          selected && "ring-1 ring-[var(--accent)]",
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label="Filter by person"
        onClick={() => {
          if (open) close();
          else {
            placeMenu();
            setOpen(true);
          }
        }}
      >
        <span className="size-8 shrink-0 overflow-hidden rounded-full">
          {selected === "__unassigned__" ? (
            <UnassignedMark />
          ) : selected ? (
            <PersonFace name={closed.title} email={selected} />
          ) : (
            <span className="flex size-full items-center justify-center bg-[var(--input)] text-[10px] font-bold text-[var(--muted)]">All</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-[var(--text)]">{closed.title}</span>
          <span className="block truncate text-[10px] text-[var(--muted)]">{closed.hint}</span>
        </span>
        <span className="shrink-0 text-[10px] text-[var(--muted)]" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              className={portaledMenuShellClass}
              style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
              onWheel={handleOverlayWheel}
            >
              <input
                ref={searchRef}
                className={cx(field, "mx-1 mt-1 mb-0 shrink-0")}
                type="search"
                placeholder="Search people"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <ul id={listId} role="listbox" aria-label="People" className={portaledMenuListClass}>
                <li role="option" aria-selected={selected == null}>
                  <button
                    type="button"
                    className={cx(
                      "flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left hover:bg-[var(--input)]",
                      selected == null && "bg-[var(--input)]",
                    )}
                    onClick={() => {
                      onChange(null);
                      close();
                    }}
                  >
                    <span className="size-7 shrink-0 rounded-full bg-[var(--input)] text-center text-[9px] font-bold leading-7 text-[var(--muted)]">All</span>
                    <span className="min-w-0 text-[12px] font-semibold text-[var(--text)]">All people</span>
                  </button>
                </li>
                {matches.showUnassigned ? (
                  <li role="option" aria-selected={selected === "__unassigned__"}>
                    <button
                      type="button"
                      className={cx(
                        "flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left hover:bg-[var(--input)]",
                        selected === "__unassigned__" && "bg-[var(--input)]",
                      )}
                      onClick={() => {
                        onChange("__unassigned__");
                        close();
                      }}
                    >
                      <span className="size-7 shrink-0">
                        <UnassignedMark />
                      </span>
                      <span className="min-w-0 text-[12px] font-semibold text-[var(--text)]">Unassigned</span>
                    </button>
                  </li>
                ) : null}
                {matches.list.map((user) => {
                  const { total, pct } = personAssignmentStats(nodes, colorBy, user.email);
                  const active = selected === user.email;
                  return (
                    <li key={user.objectId} role="option" aria-selected={active}>
                      <button
                        type="button"
                        className={cx(
                          "flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left hover:bg-[var(--input)]",
                          active && "bg-[var(--input)]",
                        )}
                        onClick={() => {
                          onChange(active ? null : user.email);
                          close();
                        }}
                      >
                        <span className="size-7 shrink-0 overflow-hidden rounded-full">
                          <PersonFace name={user.name} email={user.email} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-semibold text-[var(--text)]">{user.name}</span>
                          <span className="block truncate text-[10px] text-[var(--muted)]">
                            {pct}% done · {total} assigned
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
