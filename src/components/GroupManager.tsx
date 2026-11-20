import { useEffect, useState } from "react";
import { groupPaintColor, groupTitle } from "../graph/groups";
import { handleOverlayWheel } from "../lib/overlayScroll";
import { cx, field, fieldArea } from "../styles";
import type { GraphGroup, GraphNode } from "../types";
import type { EmployeeAssignment } from "../schema/user";
import HexColorField from "./HexColorField";
import EmployeeListField from "./EmployeeListField";

export type GroupEditPatch = {
  title?: string;
  color?: string;
  locked?: boolean;
  assignees?: EmployeeAssignment[];
  notes?: string;
};

type Props = {
  groups: GraphGroup[];
  nodes: GraphNode[];
  onUpdateGroup: (groupId: string, patch: GroupEditPatch) => void;
};

export function GroupEditFields({
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
  const [notes, setNotes] = useState(group.notes ?? "");

  useEffect(() => {
    setName(title);
  }, [title]);

  useEffect(() => {
    setNotes(group.notes ?? "");
  }, [group.id, group.notes]);

  function commitName() {
    const next = groupTitle(name);
    setName(next);
    if (next !== title) onUpdateGroup(group.id, { title: next });
  }

  function commitNotes() {
    const next = notes.replace(/\r\n/g, "\n").slice(0, 8000);
    setNotes(next);
    if (next !== (group.notes ?? "")) onUpdateGroup(group.id, { notes: next });
  }

  return (
    <div className="shrink-0 rounded-lg border border-[var(--line)] bg-[var(--input)]/40 p-1">
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
      {group.kind === "team" ? null : (
        <label className="mt-1.5 flex cursor-pointer items-center justify-between gap-2 text-[11px] font-semibold text-[var(--text)]">
          <span>Lock as map group</span>
          <input
            type="checkbox"
            checked={group.locked === true}
            onChange={(event) => onUpdateGroup(group.id, { locked: event.target.checked })}
          />
        </label>
      )}
      <div className="mt-1.5 space-y-1.5">
        <p className="m-0 text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">People</p>
        <EmployeeListField
          assignees={group.assignees ?? []}
          ariaLabel={`People for ${title}`}
          onChange={(assignees) => onUpdateGroup(group.id, { assignees })}
        />
        {group.kind === "team" ? (
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">Notes</span>
            <textarea
              className={cx(fieldArea, "min-h-[72px] text-[12px]")}
              aria-label={`Notes for ${title}`}
              value={notes}
              rows={3}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={commitNotes}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}

function GroupEditRow(props: {
  group: GraphGroup;
  memberCount: number;
  onUpdateGroup: (groupId: string, patch: GroupEditPatch) => void;
}) {
  return (
    <li className="list-none">
      <GroupEditFields {...props} />
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
