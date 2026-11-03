import { useEffect, useState } from "react";
import { groupPaintColor, groupTitle } from "../graph/groups";
import { handleOverlayWheel } from "../lib/overlayScroll";
import { cx, field } from "../styles";
import type { GraphGroup, GraphNode } from "../types";
import HexColorField from "./HexColorField";

export type GroupEditPatch = { title?: string; color?: string };

type Props = {
  groups: GraphGroup[];
  nodes: GraphNode[];
  onUpdateGroup: (groupId: string, patch: GroupEditPatch) => void;
};

function GroupEditRow({
  group,
  memberCount,
  onUpdateGroup,
}: {
  group: GraphGroup;
  memberCount: number;
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
    <li className="shrink-0 rounded-lg border border-[var(--line)] bg-[var(--input)]/40 p-1">
      <div className="mb-1 flex items-center gap-1.5">
        <input
          className={cx(field, "min-w-0 flex-1 py-[5px] text-xs font-semibold")}
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
        <span
          className="shrink-0 text-[10px] text-[var(--muted)]"
          title={`${memberCount} node${memberCount === 1 ? "" : "s"}`}
        >
          {memberCount}
        </span>
      </div>
      <HexColorField
        value={groupPaintColor(group)}
        ariaLabel={`Color for ${title}`}
        onChange={(color) => onUpdateGroup(group.id, { color })}
      />
    </li>
  );
}

export default function GroupManager({ groups, nodes, onUpdateGroup }: Props) {
  if (!groups.length) {
    return <p className="mb-0 text-[11px] text-[var(--muted)]">No groups yet. Assign nodes to create one.</p>;
  }

  return (
    <ul
      className="m-0 flex max-h-[23rem] list-none flex-col gap-1.5 overflow-y-auto overscroll-contain rounded-lg border border-[var(--line)] bg-[var(--card)] p-1.5"
      onWheel={handleOverlayWheel}
    >
      {groups.map((group) => (
        <GroupEditRow
          key={group.id}
          group={group}
          memberCount={nodes.filter((n) => n.groupId === group.id).length}
          onUpdateGroup={onUpdateGroup}
        />
      ))}
    </ul>
  );
}
