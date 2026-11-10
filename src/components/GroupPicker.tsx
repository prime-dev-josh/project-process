import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { groupPath, leafGroups } from "../graph/groupTree";
import { groupPaintColor, groupTitle } from "../graph/groups";
import { placePortaledMenu, portaledMenuListClass, portaledMenuShellClass, type PortaledMenuPos } from "../lib/dropdownPortal";
import { handleOverlayWheel } from "../lib/overlayScroll";
import { cx, field } from "../styles";
import type { GraphGroup, GraphNode } from "../types";
import HexColorField from "./HexColorField";
import type { GroupEditPatch } from "./GroupManager";

type Props = {
  groupId: string | null;
  groups: GraphGroup[];
  nodes: GraphNode[];
  mixed?: boolean;
  emptyLabel?: string;
  onChange: (groupId: string | null) => void;
  onUpdateGroup?: (groupId: string, patch: GroupEditPatch) => void;
};

function CurrentGroupEditor({
  group,
  onUpdateGroup,
}: {
  group: GraphGroup;
  onUpdateGroup: (groupId: string, patch: GroupEditPatch) => void;
}) {
  const title = groupTitle(group.title);
  const [name, setName] = useState(title);

  useEffect(() => {
    setName(title);
  }, [title]);

  function commitName() {
    const next = groupTitle(name);
    setName(next);
    if (next !== title) onUpdateGroup(group.id, { title: next });
  }

  return (
    <div className="mt-1.5 space-y-1.5">
      <input
        className={cx(field, "py-[5px] text-xs font-semibold")}
        value={name}
        aria-label="Group name"
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setName(title);
          }
        }}
      />
      <HexColorField
        value={groupPaintColor(group)}
        ariaLabel={`Color for ${title}`}
        onChange={(color) => onUpdateGroup(group.id, { color })}
      />
    </div>
  );
}

function GroupDot({ color, muted }: { color?: string; muted?: boolean }) {
  return (
    <span
      className="inline-block size-3.5 shrink-0 rounded-full"
      style={{ background: muted ? "var(--input)" : color, boxShadow: muted ? "inset 0 0 0 1px var(--line)" : undefined }}
      aria-hidden
    />
  );
}

export default function GroupPicker({
  groupId,
  groups,
  nodes,
  mixed = false,
  emptyLabel = "None",
  onChange,
  onUpdateGroup,
}: Props) {
  const current = !mixed ? groups.find((group) => group.id === groupId) ?? null : null;
  const currentMembers = current ? nodes.filter((n) => n.groupId === current.id) : [];
  const currentColor = current ? groupPaintColor(current) : undefined;
  const closedTitle = mixed ? emptyLabel : current ? groupTitle(current.title) : "None";
  const currentPath = current ? groupPath(groups, current.id) : [];
  const currentTrail = currentPath.length > 1 ? currentPath.slice(0, -1).join(" / ") : "";
  const currentCount = `${currentMembers.length} node${currentMembers.length === 1 ? "" : "s"}`;
  const closedHint = mixed ? "Groups differ" : current ? (currentTrail ? `${currentTrail} · ${currentCount}` : currentCount) : "Not in a group";
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPos, setMenuPos] = useState<PortaledMenuPos | null>(null);
  const leaves = useMemo(() => leafGroups(groups), [groups]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leaves;
    return leaves.filter((group) => groupPath(groups, group.id).join(" ").toLowerCase().includes(q));
  }, [groups, leaves, query]);

  function placeMenu() {
    if (!rootRef.current) return;
    setMenuPos(placePortaledMenu(rootRef.current, 320));
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (!open) return;
    placeMenu();
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

  useEffect(() => {
    if (open && menuPos) searchRef.current?.focus();
  }, [open, menuPos]);

  function assign(id: string | null) {
    onChange(id);
    close();
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={cx(field, "flex items-center justify-between gap-2 py-1.5 pr-2 text-left")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Group"
        onClick={() => {
          if (open) close();
          else {
            placeMenu();
            setOpen(true);
          }
        }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <GroupDot color={currentColor} muted={!current} />
          <span className="min-w-0">
            <span className={cx("block truncate text-[13px] font-semibold", current ? "text-[var(--text)]" : "text-[var(--muted)]")}>
              {closedTitle}
            </span>
            <span className="block truncate text-[11px] text-[var(--muted)]">{closedHint}</span>
          </span>
        </span>
        <svg
          className={cx("size-3.5 shrink-0 text-[var(--muted)] transition-transform", open && "rotate-180")}
          viewBox="0 0 12 12"
          aria-hidden
        >
          <path d="M2.2 4.2L6 8l3.8-3.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && menuPos && typeof document !== "undefined"
        ? createPortal(
          <div
            ref={menuRef}
            id={listId}
            className={portaledMenuShellClass}
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width, maxHeight: menuPos.maxHeight }}
            role="listbox"
            aria-label="Groups"
            onWheel={handleOverlayWheel}
          >
            <input
              ref={searchRef}
              className={cx(field, "shrink-0 rounded-none border-0 border-b")}
              placeholder="Search groups"
              aria-label="Search groups"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (matches[0]) assign(matches[0].id);
              }}
            />
            <ul className={cx(portaledMenuListClass, "max-h-36")}>
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={!mixed && !current}
                  className={cx(
                    "flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-1.5 py-1.5 text-left hover:bg-[var(--hover)]",
                    !mixed && !current && "ring-1 ring-inset ring-[var(--accent)]",
                  )}
                  onClick={() => assign(null)}
                >
                  <GroupDot muted />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-[var(--text)]">None</span>
                    <span className="block truncate text-[10px] text-[var(--muted)]">Remove from group</span>
                  </span>
                </button>
              </li>
              {matches.map((group) => {
                const members = nodes.filter((n) => n.groupId === group.id);
                const tone = groupPaintColor(group);
                const active = group.id === groupId;
                const trail = groupPath(groups, group.id).slice(0, -1).join(" / ");
                const countLabel = `${members.length} node${members.length === 1 ? "" : "s"}`;
                return (
                  <li key={group.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={cx(
                        "flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-1.5 py-1.5 text-left hover:bg-[var(--hover)]",
                        active && "ring-1 ring-inset ring-[var(--accent)]",
                      )}
                      onClick={() => assign(group.id)}
                    >
                      <GroupDot color={tone} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-[var(--text)]">{groupTitle(group.title)}</span>
                        <span className="block truncate text-[10px] text-[var(--muted)]">
                          {trail ? `${trail} · ${countLabel}` : countLabel}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {!matches.length ? (
                <li className="px-2 py-2 text-[11px] text-[var(--muted)]">No matching groups</li>
              ) : null}
            </ul>
          </div>,
          document.body,
        ) : null}
      {current && onUpdateGroup ? (
        <CurrentGroupEditor group={current} onUpdateGroup={onUpdateGroup} />
      ) : null}
    </div>
  );
}
