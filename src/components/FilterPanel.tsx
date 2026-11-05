import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  WORKFLOW_STATUS_META,
  groupCompletionStats,
  personAssignmentStats,
  statusPercent,
  workflowStats,
  type WorkflowStatus,
} from "../graph/workflowStatus";
import { users } from "../data/users";
import { groupPaintColor, groupTitle, UNGROUPED_FILTER } from "../graph/groups";
import { personStyle } from "../data/personStyle";
import {
  FORCE_INTENSITY,
  FORCE_LEVELS,
  nearestForceLevel,
} from "../graph/viewSettings";
import { cx, field, sideH2 } from "../styles";
import type { ColorBy, GraphGroup, GraphNode, GraphSettings } from "../types";
import { isFiltered } from "../graph/visibility";
import GroupPanelContextMenu from "./GroupPanelContextMenu";
import type { GroupEditPatch } from "./GroupManager";
import PersonFace from "./PersonFace";
import SegmentedControl from "./SegmentedControl";
import SliderField from "./SliderField";

type Props = {
  nodes: GraphNode[];
  colorBy: ColorBy;
  settings: GraphSettings;
  search: string;
  statusFilters: WorkflowStatus[];
  employeeFilter: string | null;
  groups: GraphGroup[];
  groupFilters: string[];
  onSearch: (v: string) => void;
  onStatusFilters: (v: WorkflowStatus[]) => void;
  onEmployeeFilter: (v: string | null) => void;
  onGroupFilters: (v: string[]) => void;
  onClearFilters: () => void;
  onSettings: (patch: Partial<GraphSettings>) => void;
  onFit: () => void;
  onReorg: () => void;
  onTogglePhysics: () => void;
  onToggleCards: () => void;
  onResetSettings: () => void;
  selectedNodeId?: string | null;
  onUpdateGroup: (groupId: string, patch: GroupEditPatch) => void;
  /** When set, replaces the View section below the filter divider (e.g. node editor). */
  viewReplacement?: ReactNode;
};

function toggleStatus(list: WorkflowStatus[], status: WorkflowStatus) {
  return list.includes(status)
    ? list.filter((s) => s !== status)
    : [...list, status];
}

export default function FilterPanel({
  nodes,
  colorBy,
  settings,
  search,
  statusFilters,
  employeeFilter,
  groups,
  groupFilters,
  onSearch,
  onStatusFilters,
  onEmployeeFilter,
  onGroupFilters,
  onClearFilters,
  onSettings,
  onFit,
  onReorg,
  onTogglePhysics,
  onToggleCards,
  onResetSettings,
  selectedNodeId = null,
  onUpdateGroup,
  viewReplacement,
}: Props) {
  const stats = useMemo(() => workflowStats(nodes, colorBy), [nodes, colorBy]);
  const [advanced, setAdvanced] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(true);
  const [groupsOpen, setGroupsOpen] = useState(true);
  const [groupEditMenu, setGroupEditMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (selectedNodeId) {
      setAdvanced(false);
      setGroupEditMenu(null);
    }
  }, [selectedNodeId]);
  const hasFilters =
    Boolean(search.trim()) ||
    statusFilters.length > 0 ||
    employeeFilter != null ||
    groupFilters.length > 0;
  const filterOptions = useMemo(
    () => ({
      statusFilters,
      employeeEmail: employeeFilter,
      groupIds: groupFilters,
    }),
    [statusFilters, employeeFilter, groupFilters],
  );
  const matchingNodeCount = useMemo(
    () =>
      nodes.filter((node) => isFiltered(node, search, colorBy, filterOptions))
        .length,
    [nodes, search, colorBy, filterOptions],
  );
  const filtersHideAll =
    hasFilters && nodes.length > 0 && matchingNodeCount === 0;

  function toggleGroupFilter(id: string) {
    onGroupFilters(
      groupFilters.includes(id)
        ? groupFilters.filter((g) => g !== id)
        : [...groupFilters, id],
    );
  }

  const ungroupedCount = useMemo(
    () => nodes.filter((n) => !n.groupId).length,
    [nodes],
  );
  const groupEditTarget = groupEditMenu
    ? groups.find((g) => g.id === groupEditMenu.id)
    : null;
  const statusSelectionActive = statusFilters.length > 0;
  const peopleSelectionActive = employeeFilter != null;
  const groupsSelectionActive = groupFilters.length > 0;

  return (
    <div className="filter-panel flex h-full min-h-0 flex-col">
      <div className="flex-col p-2">
        <div
          className="flex items-center justify-between gap-2 mb-2"
          aria-label="Left click for info and edit. Right click to add nodes and links."
          title="Left click: info and edit. Right click: add nodes and links."
        >
          <div className="min-w-0 flex-1 text-right">
            <p className="m-0 text-[9px] font-semibold leading-tight text-[var(--text)]">
              Info / edit
            </p>
            <p className="m-0 text-[8px] leading-tight text-[var(--muted)]">
              Left click
            </p>
          </div>
          <MouseHint />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[9px] font-semibold leading-tight text-[var(--text)]">
              Add links / nodes
            </p>
            <p className="m-0 text-[8px] leading-tight text-[var(--muted)]">
              Right click
            </p>
          </div>
        </div>
        <input
          className={field}
          type="search"
          placeholder="Search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <section className="shrink-0 p-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className={cx(sideH2, "mb-0")}>Filter</h2>
          {hasFilters ? (
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 text-[10px] text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
              title="Clear search and filters, then fit the map"
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
          {WORKFLOW_STATUS_META.map(
            ({ id, label, filterLabel, pillBg, pillText }) => {
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
                    on
                      ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
                      : "border-transparent",
                    !on &&
                      statusSelectionActive &&
                      "opacity-50 hover:opacity-100",
                  )}
                  style={{ background: pillBg, color: pillText }}
                  aria-pressed={on}
                  aria-label={`${label} (${pct}%)`}
                  onClick={() =>
                    onStatusFilters(toggleStatus(statusFilters, id))
                  }
                >
                  {filterLabel.toUpperCase()} ({pct}%)
                </button>
              );
            },
          )}
        </div>
        <FacetHeading>People</FacetHeading>
        {peopleOpen ? (
          <div className="grid grid-cols-6 gap-2 pb-2" aria-label="People">
            <PersonBall
              label="Unassigned"
              active={employeeFilter === "__unassigned__"}
              faded={
                peopleSelectionActive && employeeFilter !== "__unassigned__"
              }
              pct={0}
              ringColor="var(--line)"
              onClick={() =>
                onEmployeeFilter(
                  employeeFilter === "__unassigned__" ? null : "__unassigned__",
                )
              }
            >
              <svg
                className="size-4 text-[var(--muted)]"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <circle cx="12" cy="8" r="4" fill="currentColor" />
                <path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="currentColor" />
              </svg>
            </PersonBall>
            {users.map((user) => {
              const { total, pct } = personAssignmentStats(
                nodes,
                colorBy,
                user.email,
              );
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
        {groups.length ? (
          <>
            <FacetHeading>Groups</FacetHeading>
            {groupsOpen ? (
              <div className="grid grid-cols-6 gap-2 pb-2" aria-label="Groups">
                <GroupBall
                  label={`Ungrouped — ${ungroupedCount} nodes`}
                  active={groupFilters.includes(UNGROUPED_FILTER)}
                  faded={
                    groupsSelectionActive &&
                    !groupFilters.includes(UNGROUPED_FILTER)
                  }
                  pct={0}
                  color="var(--muted)"
                  initials="—"
                  onClick={() => toggleGroupFilter(UNGROUPED_FILTER)}
                />
                {groups.map((group) => {
                  const { pct, total } = groupCompletionStats(
                    nodes,
                    colorBy,
                    group.id,
                  );
                  const color = groupPaintColor(group);
                  const title = groupTitle(group.title);
                  const initials = title
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase() ?? "")
                    .join("");
                  return (
                    <GroupBall
                      key={group.id}
                      label={`${title} — ${pct}% done (${total} nodes)`}
                      active={groupFilters.includes(group.id)}
                      faded={
                        groupsSelectionActive &&
                        !groupFilters.includes(group.id)
                      }
                      pct={pct}
                      color={color}
                      initials={initials || "G"}
                      onClick={() => toggleGroupFilter(group.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setGroupEditMenu({
                          id: group.id,
                          x: e.clientX,
                          y: e.clientY,
                        });
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-[10px] text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
                onClick={() => setGroupsOpen(true)}
              >
                Show {groups.length + 1} groups
              </button>
            )}
            {groupEditMenu && groupEditTarget ? (
              <GroupPanelContextMenu
                x={groupEditMenu.x}
                y={groupEditMenu.y}
                group={groupEditTarget}
                memberCount={
                  nodes.filter((n) => n.groupId === groupEditTarget.id).length
                }
                onUpdateGroup={onUpdateGroup}
                onClose={() => setGroupEditMenu(null)}
              />
            ) : null}
          </>
        ) : null}
      </section>

      <section
        className={cx(
          "flex min-h-0 flex-1 flex-col border-t border-[var(--line)]",
          viewReplacement ? "overflow-hidden pb-0" : "shrink-0 pb-0.5",
        )}
      >
        {viewReplacement ?? (
          <div className="p-2">
            <h2 className={cx(sideH2, "mb-1.5")}>View</h2>
            <p className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">
              Map
            </p>
            <SegmentedControl
              options={[
                {
                  id: "fit",
                  label: "Fit",
                  title: "Fit the graph in the window",
                },
                {
                  id: "reorg",
                  label: "Reorg",
                  title:
                    "Untangle overlaps and stretch links without pulling the map into a ball",
                },
                {
                  id: "physics",
                  label: "Physics",
                  title: "Let nodes move and settle",
                },
              ]}
              pressed={settings.physics ? (["physics"] as const) : []}
              onSelect={(id) => {
                if (id === "fit") onFit();
                else if (id === "reorg") onReorg();
                else onTogglePhysics();
              }}
            />
            <p className="mt-2 mb-1 text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">
              Look
            </p>
            <SegmentedControl
              options={[
                {
                  id: "text",
                  label: "Text",
                  title: "Show or hide node titles",
                },
                {
                  id: "cards",
                  label: "Cards",
                  title: "Show info cards when zoomed in",
                },
              ]}
              pressed={[
                ...(settings.showText ? (["text"] as const) : []),
                ...(settings.cardInfo ? (["cards"] as const) : []),
              ]}
              onSelect={(id) => {
                if (id === "text") onSettings({ showText: !settings.showText });
                else onToggleCards();
              }}
            />
            <SliderField
              label="Node"
              min={1}
              max={4}
              step={0.05}
              value={settings.enlarge ?? 1}
              onChange={(enlarge) => onSettings({ enlarge })}
            />
            <SliderField
              label="Text"
              min={0.7}
              max={1.8}
              step={0.05}
              value={settings.textScale ?? settings.enlarge ?? 1}
              onChange={(textScale) => onSettings({ textScale })}
            />
            <SliderField
              label="Card"
              min={0.7}
              max={1.8}
              step={0.05}
              value={settings.cardScale ?? settings.enlarge ?? 1}
              onChange={(cardScale) => onSettings({ cardScale })}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase hover:text-[var(--text)]"
                aria-expanded={advanced}
                onClick={() => setAdvanced((open) => !open)}
              >
                {advanced ? "▾" : "▸"} Advanced
              </button>
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-[10px] text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
                title="Reset view settings on this device to their defaults"
                onClick={onResetSettings}
              >
                Reset view prefs
              </button>
            </div>
            {advanced && !settings.physics ? (
              <p className="mt-1 mb-0 text-[10px] text-[var(--muted)]">
                Turn on Physics to tune forces.
              </p>
            ) : null}
            {advanced && settings.physics ? (
              <div className="mt-1.5">
                <p className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">
                  Forces
                </p>
                <ForceIntensityRow
                  label="Spread"
                  values={FORCE_INTENSITY.charge}
                  value={settings.charge}
                  onChange={(charge) => onSettings({ charge })}
                />
                <ForceIntensityRow
                  label="Link length"
                  values={FORCE_INTENSITY.linkDistance}
                  value={settings.linkDistance}
                  onChange={(linkDistance) => onSettings({ linkDistance })}
                />
                <ForceIntensityRow
                  label="Padding"
                  values={FORCE_INTENSITY.collide}
                  value={settings.collide}
                  onChange={(collide) => onSettings({ collide })}
                />
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function ForceIntensityRow({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: readonly number[];
  value: number;
  onChange: (value: number) => void;
}) {
  const level = nearestForceLevel(values, value);
  const maxLevel = Math.min(FORCE_LEVELS, values.length) - 1;
  return (
    <SliderField
      label={label}
      min={0}
      max={maxLevel}
      step={1}
      debounceMs={0}
      value={level}
      onChange={(index) => {
        const next = values[Math.round(index)];
        if (next != null) onChange(next);
      }}
    />
  );
}

function MouseHint() {
  return (
    <svg
      width="22"
      height="28"
      viewBox="0 0 22 28"
      aria-hidden
      className="shrink-0 text-[var(--text)]"
    >
      <rect
        x="3"
        y="1.5"
        width="16"
        height="25"
        rx="8"
        fill="var(--input)"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M11 1.5 V12.2" stroke="currentColor" strokeWidth="1.1" />
      <path d="M3 12.2 H19" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M3 9.5 A8 8 0 0 1 11 1.5 V12.2 H3 Z"
        fill="var(--accent)"
        opacity="0.88"
      />
      <path
        d="M19 9.5 A8 8 0 0 0 11 1.5 V12.2 H19 Z"
        fill="currentColor"
        opacity="0.18"
      />
      <rect
        x="10.1"
        y="5.2"
        width="1.8"
        height="4.2"
        rx="0.9"
        fill="var(--card)"
      />
    </svg>
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
        active &&
          "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--card)]",
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

function GroupBall({
  label,
  active,
  faded = false,
  pct,
  color,
  initials,
  onClick,
  onContextMenu,
}: {
  label: string;
  active: boolean;
  faded?: boolean;
  pct: number;
  color: string;
  initials: string;
  onClick: () => void;
  onContextMenu?: (e: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        "relative size-9 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0 transition-opacity hover:brightness-105",
        active &&
          "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--card)]",
        faded && "opacity-50 hover:opacity-100",
      )}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <span
        className="flex size-full items-center justify-center rounded-full text-[9px] font-bold leading-none"
        style={{
          color,
          background: `color-mix(in srgb, ${color} 22%, var(--input))`,
          boxShadow: `0 0 0 2px ${color}, 0 0 0 3px var(--card)`,
        }}
      >
        {initials}
      </span>
      <span className="absolute -right-0.5 -bottom-0.5 min-w-[18px] rounded-full bg-[#3b5bcc] px-0.5 text-center text-[7px] font-bold leading-[14px] text-white">
        {pct}%
      </span>
    </button>
  );
}
