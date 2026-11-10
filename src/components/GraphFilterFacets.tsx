import { useMemo, useState, type ReactNode } from "react";
import { users } from "../data/users";
import { personStyle } from "../data/personStyle";
import {
  WORKFLOW_STATUS_META,
  personAssignmentStats,
  statusPercent,
  workflowStats,
  type WorkflowStatus,
} from "../graph/workflowStatus";
import { isFiltered } from "../graph/visibility";
import { cx, field, sideH2 } from "../styles";
import type { ColorBy, GraphGroup, GraphNode } from "../types";
import GroupFilterPicker from "./GroupFilterPicker";
import GroupPanelContextMenu from "./GroupPanelContextMenu";
import type { GroupEditPatch } from "./GroupManager";
import PersonFace from "./PersonFace";

export function toggleStatusFilter(list: WorkflowStatus[], status: WorkflowStatus) {
  return list.includes(status) ? list.filter((s) => s !== status) : [...list, status];
}

type Props = {
  nodes: GraphNode[];
  groups: GraphGroup[];
  colorBy: ColorBy;
  search: string;
  statusFilters: WorkflowStatus[];
  employeeFilter: string | null;
  groupFilters: string[];
  onSearch: (v: string) => void;
  onStatusFilters: (v: WorkflowStatus[]) => void;
  onEmployeeFilter: (v: string | null) => void;
  onGroupFilters: (v: string[]) => void;
  onClearFilters: () => void;
  onUpdateGroup?: (groupId: string, patch: GroupEditPatch) => void;
  showSearch?: boolean;
  showGroupFacet?: boolean;
};

export default function GraphFilterFacets({
  nodes,
  groups,
  colorBy,
  search,
  statusFilters,
  employeeFilter,
  groupFilters,
  onSearch,
  onStatusFilters,
  onEmployeeFilter,
  onGroupFilters,
  onClearFilters,
  onUpdateGroup,
  showSearch = false,
  showGroupFacet = true,
}: Props) {
  const stats = useMemo(() => workflowStats(nodes, colorBy), [nodes, colorBy]);
  const [peopleOpen, setPeopleOpen] = useState(true);
  const [groupEditMenu, setGroupEditMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const hasFilters =
    Boolean(search.trim()) ||
    statusFilters.length > 0 ||
    employeeFilter != null ||
    (showGroupFacet && groupFilters.length > 0);
  const filterOptions = useMemo(
    () => ({
      statusFilters,
      employeeEmail: employeeFilter,
      groupIds: showGroupFacet ? groupFilters : [],
    }),
    [statusFilters, employeeFilter, groupFilters, showGroupFacet],
  );
  const matchingNodeCount = useMemo(
    () => nodes.filter((node) => isFiltered(node, search, colorBy, filterOptions)).length,
    [nodes, search, colorBy, filterOptions],
  );
  const filtersHideAll = hasFilters && nodes.length > 0 && matchingNodeCount === 0;
  const statusSelectionActive = statusFilters.length > 0;
  const peopleSelectionActive = employeeFilter != null;

  const groupEditTarget = groupEditMenu ? groups.find((g) => g.id === groupEditMenu.id) : null;

  return (
    <section className="min-w-0">
      {showSearch ? (
        <input
          className={cx(field, "mb-2 w-full")}
          type="search"
          placeholder="Search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      ) : null}
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className={cx(sideH2, "mb-0")}>Filter</h2>
        {hasFilters ? (
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-[10px] text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
            title="Clear search and filters"
            onClick={onClearFilters}
          >
            Clear filters
          </button>
        ) : null}
      </div>
      <p className="mb-1.5 text-[11px] leading-snug text-[var(--muted)]">
        {filtersHideAll ? "No nodes match the current filters." : " "}
      </p>

      <FacetHeading>Status</FacetHeading>
      <div className="flex flex-wrap gap-1">
        {WORKFLOW_STATUS_META.map(({ id, label, filterLabel, pillBg, pillText }) => {
          const count = stats.counts[id];
          const pct = statusPercent(count, stats.total);
          const on = statusFilters.includes(id);
          return (
            <button
              key={id}
              type="button"
              title={`${label} (${pct}%)`}
              className={cx(
                "flex h-6 min-w-0 cursor-pointer items-center justify-center rounded-full border px-2 text-[9px] font-bold leading-none tracking-tight whitespace-nowrap transition-opacity",
                on ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]" : "border-transparent",
                !on && statusSelectionActive && "opacity-50 hover:opacity-100",
              )}
              style={{ background: pillBg, color: pillText }}
              aria-pressed={on}
              aria-label={`${label} (${pct}%)`}
              onClick={() => onStatusFilters(toggleStatusFilter(statusFilters, id))}
            >
              {filterLabel.toUpperCase()} ({pct}%)
            </button>
          );
        })}
      </div>

      <FacetHeading>People</FacetHeading>
      {peopleOpen ? (
        <div className="grid grid-cols-6 gap-2 pb-2" aria-label="People">
          <PersonBall
            label="Unassigned"
            active={employeeFilter === "__unassigned__"}
            faded={peopleSelectionActive && employeeFilter !== "__unassigned__"}
            pct={0}
            ringColor="var(--line)"
            onClick={() =>
              onEmployeeFilter(employeeFilter === "__unassigned__" ? null : "__unassigned__")
            }
          >
            <svg className="size-4 text-[var(--muted)]" viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="8" r="4" fill="currentColor" />
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="currentColor" />
            </svg>
          </PersonBall>
          {users.map((user) => {
            const { total, pct } = personAssignmentStats(nodes, colorBy, user.email);
            const active = employeeFilter === user.email;
            const ring = personStyle(user.email).color;
            return (
              <PersonBall
                key={user.objectId}
                label={`${user.name} — ${pct}% done (${total} assigned)`}
                active={active}
                faded={peopleSelectionActive && !active}
                pct={pct}
                ringColor={ring}
                onClick={() => onEmployeeFilter(active ? null : user.email)}
              >
                <PersonFace name={user.name} email={user.email} />
              </PersonBall>
            );
          })}
        </div>
      ) : (
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-[10px] text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
          onClick={() => setPeopleOpen(true)}
        >
          Show {users.length + 1} people
        </button>
      )}

      {showGroupFacet && groups.length ? (
        <>
          <FacetHeading>Groups</FacetHeading>
          <div className="pb-2">
            <GroupFilterPicker
              groups={groups}
              nodes={nodes}
              colorBy={colorBy}
              selected={groupFilters}
              onChange={onGroupFilters}
              onEditGroup={
                onUpdateGroup
                  ? (id, x, y) => setGroupEditMenu({ id, x, y })
                  : undefined
              }
            />
          </div>
          {groupEditMenu && groupEditTarget && onUpdateGroup ? (
            <GroupPanelContextMenu
              x={groupEditMenu.x}
              y={groupEditMenu.y}
              group={groupEditTarget}
              memberCount={nodes.filter((n) => n.groupId === groupEditTarget.id).length}
              onUpdateGroup={onUpdateGroup}
              onClose={() => setGroupEditMenu(null)}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function FacetHeading({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 mt-3 text-[11px] font-bold tracking-wide text-[var(--accent)] uppercase first:mt-0">
      {children}
    </p>
  );
}

function PersonBall({
  label,
  active,
  faded = false,
  pct,
  ringColor,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  faded?: boolean;
  pct: number;
  ringColor: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        "relative size-9 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0 transition-opacity hover:brightness-105",
        active && "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--card)]",
        faded && "opacity-50 hover:opacity-100",
      )}
      onClick={onClick}
    >
      <span
        className="flex size-full items-center justify-center overflow-hidden rounded-full bg-[var(--input)]"
        style={{ boxShadow: `0 0 0 2px ${ringColor}, 0 0 0 3px var(--card)` }}
      >
        {children}
      </span>
      <span className="absolute -right-0.5 -bottom-0.5 min-w-[18px] rounded-full bg-[#3b5bcc] px-0.5 text-center text-[7px] font-bold leading-[14px] text-white">
        {pct}%
      </span>
    </button>
  );
}
