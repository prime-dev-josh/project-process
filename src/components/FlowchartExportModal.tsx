import { useEffect, useMemo, useRef, useState } from "react";
import { groupPath, leafGroups } from "../graph/groupTree";
import { groupPaintColor, groupTitle, UNGROUPED_FILTER } from "../graph/groups";
import { cx, field, ghostBtn, primaryBtn } from "../styles";
import type { GraphGroup, GraphNode } from "../types";

type Row = {
  id: string;
  title: string;
  trail: string;
  count: number;
  color?: string;
};

type Props = {
  groups: GraphGroup[];
  nodes: GraphNode[];
  onExport: (groupIds: string[]) => void;
  onCancel: () => void;
};

export default function FlowchartExportModal({ groups, nodes, onExport, onCancel }: Props) {
  const exportRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const leaves = useMemo(() => leafGroups(groups), [groups]);
  const rows = useMemo(() => {
    const list: Row[] = leaves.map((group) => {
      const path = groupPath(groups, group.id);
      return {
        id: group.id,
        title: groupTitle(group.title),
        trail: path.length > 1 ? path.slice(0, -1).join(" / ") : "",
        count: nodes.filter((node) => node.groupId === group.id).length,
        color: groupPaintColor(group),
      };
    });
    const ungrouped = nodes.filter((node) => !node.groupId).length;
    if (ungrouped) {
      list.push({
        id: UNGROUPED_FILTER,
        title: "Ungrouped",
        trail: "Nodes with no group",
        count: ungrouped,
      });
    }
    return list;
  }, [groups, leaves, nodes]);
  const allIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const [selected, setSelected] = useState<string[]>(() => allIds);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setSelected((prev) => (prev.length === 0 && allIds.length ? allIds : prev));
  }, [allIds]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => `${row.trail} ${row.title}`.toLowerCase().includes(q));
  }, [query, rows]);

  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  const selectedCount = selected.length;
  const canExport = selectedCount > 0;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[rgba(12,16,24,0.45)] p-5"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[min(80vh,640px)] w-[min(460px,100%)] flex-col overflow-hidden rounded-[14px] border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flowchartExportTitle"
        aria-describedby="flowchartExportBody"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 px-4 pt-4 pb-2">
          <h2 id="flowchartExportTitle" className="mt-0 mb-1.5 text-base text-[var(--accent)]">
            Export flowcharts
          </h2>
          <p id="flowchartExportBody" className="mt-0 mb-3 text-[13px] leading-snug text-[var(--muted)]">
            One landscape page per selected group, using that group’s nodes and links. Folders are omitted — pick the groups that hold nodes.
          </p>
          <input
            ref={searchRef}
            className={field}
            placeholder="Search groups"
            aria-label="Search groups"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--muted)]">
              {selectedCount} of {allIds.length} selected
            </span>
            <div className="flex gap-1.5">
              <button type="button" className={cx(ghostBtn, "px-2 py-[3px] text-[11px]")} onClick={() => setSelected(allIds)}>
                Select all
              </button>
              <button type="button" className={cx(ghostBtn, "px-2 py-[3px] text-[11px]")} onClick={() => setSelected([])}>
                None
              </button>
            </div>
          </div>
        </div>
        <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto border-t border-[var(--line)] px-2 py-1.5">
          {matches.map((row) => {
            const checked = selected.includes(row.id);
            const countLabel = `${row.count} node${row.count === 1 ? "" : "s"}`;
            return (
              <li key={row.id}>
                <label
                  className={cx(
                    "flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-[var(--hover)]",
                    checked && "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-3.5 shrink-0 accent-[var(--accent)]"
                    checked={checked}
                    onChange={() => toggle(row.id)}
                  />
                  <span
                    className="inline-block size-3.5 shrink-0 rounded-full"
                    style={{
                      background: row.color ?? "var(--input)",
                      boxShadow: row.color ? undefined : "inset 0 0 0 1px var(--line)",
                    }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[var(--text)]">{row.title}</span>
                    <span className="block truncate text-[11px] text-[var(--muted)]">
                      {row.trail ? `${row.trail} · ${countLabel}` : countLabel}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
          {!matches.length ? <li className="px-2 py-3 text-[12px] text-[var(--muted)]">No matching groups</li> : null}
        </ul>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--line)] px-4 py-3">
          <button type="button" className={ghostBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            ref={exportRef}
            type="button"
            className={cx(primaryBtn, !canExport && "cursor-not-allowed opacity-50")}
            disabled={!canExport}
            onClick={() => onExport(selected)}
          >
            Export {selectedCount} page{selectedCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
