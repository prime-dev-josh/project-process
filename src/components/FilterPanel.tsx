import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  WORKFLOW_STATUS_META,
  personAssignmentStats,
  statusPercent,
  workflowStats,
  type WorkflowStatus,
} from "../graph/workflowStatus";
import { users } from "../data/users";
import { FORCE_INTENSITY, FORCE_INTENSITY_IDS, nearestForceLevel } from "../graph/viewSettings";
import { cx, field, sideH2 } from "../styles";
import type { ColorBy, GraphGroup, GraphNode, GraphSettings } from "../types";
import { isFiltered } from "../graph/visibility";
import GroupFilterPicker from "./GroupFilterPicker";
import GroupManager, { type GroupEditPatch } from "./GroupManager";
import PersonFace from "./PersonFace";
import PersonFilterPicker from "./PersonFilterPicker";
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
};

function toggleStatus(list: WorkflowStatus[], status: WorkflowStatus) {
  return list.includes(status) ? list.filter((s) => s !== status) : [...list, status];
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
}: Props) {
  const stats = useMemo(() => workflowStats(nodes, colorBy), [nodes, colorBy]);
  const [advanced, setAdvanced] = useState(false);
  const [manageGroups, setManageGroups] = useState(false);

  useEffect(() => {
    if (selectedNodeId) {
      setAdvanced(false);
      setManageGroups(false);
    }
  }, [selectedNodeId]);
  const personRowProbeRef = useRef<HTMLDivElement>(null);
  const [personRowCompact, setPersonRowCompact] = useState(false);
  const hasFilters =
    Boolean(search.trim()) || statusFilters.length > 0 || employeeFilter != null || groupFilters.length > 0;
  const filterOptions = useMemo(
    () => ({ statusFilters, employeeEmail: employeeFilter, groupIds: groupFilters }),
    [statusFilters, employeeFilter, groupFilters],
  );
  const matchingNodeCount = useMemo(
    () => nodes.filter((node) => isFiltered(node, search, colorBy, filterOptions)).length,
    [nodes, search, colorBy, filterOptions],
  );
  const filtersHideAll = hasFilters && nodes.length > 0 && matchingNodeCount === 0;

  useEffect(() => {
    const probe = personRowProbeRef.current;
    if (!probe) return;
    const measure = () => setPersonRowCompact(probe.scrollHeight > 40);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(probe);
    return () => ro.disconnect();
  }, [users.length]);

  return (
    <div className="filter-panel space-y-2.5 pt-0.5">
      <div
        className="flex items-center justify-between gap-2 px-0.5"
        aria-label="Left click for info and edit. Right click to add nodes and links."
        title="Left click: info and edit. Right click: add nodes and links."
      >
        <div className="min-w-0 flex-1 text-right">
          <p className="m-0 text-[9px] font-semibold leading-tight text-[var(--text)]">Info / edit</p>
          <p className="m-0 text-[8px] leading-tight text-[var(--muted)]">Left click</p>
        </div>
        <MouseHint />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[9px] font-semibold leading-tight text-[var(--text)]">Add links / nodes</p>
          <p className="m-0 text-[8px] leading-tight text-[var(--muted)]">Right click</p>
        </div>
      </div>
      <input
        className={field}
        type="search"
        placeholder="Search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />

      <section>
        <div className="mb-1.5 flex items-center justify-between gap-2">
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
        <div className="grid grid-cols-3 gap-0.5">
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
                  "flex h-5 min-w-0 cursor-pointer items-center justify-center rounded-full border px-0.5 text-[9px] font-semibold leading-none tracking-tight whitespace-nowrap",
                  on ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]" : "border-transparent",
                )}
                style={{ background: pillBg, color: pillText }}
                aria-pressed={on}
                aria-label={`${label} (${pct}%)`}
                onClick={() => onStatusFilters(toggleStatus(statusFilters, id))}
              >
                {filterLabel} ({pct}%)
              </button>
            );
          })}
        </div>
        <div className="relative mt-2">
          <div
            ref={personRowProbeRef}
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex flex-wrap gap-1.5 opacity-0"
            aria-hidden
          >
            <PersonBall label="Unassigned" active={false} pct={0} onClick={() => {}}>
              <svg className="size-3.5 text-[var(--muted)]" viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="8" r="4" fill="currentColor" />
                <path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="currentColor" />
              </svg>
            </PersonBall>
            {users.map((user) => (
              <PersonBall key={user.objectId} label="" active={false} pct={0} onClick={() => {}}>
                <PersonFace name={user.name} email={user.email} />
              </PersonBall>
            ))}
          </div>
          {personRowCompact ? (
            <PersonFilterPicker
              nodes={nodes}
              colorBy={colorBy}
              selected={employeeFilter}
              onChange={onEmployeeFilter}
            />
          ) : (
            <div className="flex flex-wrap gap-1.5" aria-label="People">
              <PersonBall
                label="Unassigned"
                active={employeeFilter === "__unassigned__"}
                pct={0}
                onClick={() => onEmployeeFilter(employeeFilter === "__unassigned__" ? null : "__unassigned__")}
              >
                <svg className="size-3.5 text-[var(--muted)]" viewBox="0 0 24 24" aria-hidden>
                  <circle cx="12" cy="8" r="4" fill="currentColor" />
                  <path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="currentColor" />
                </svg>
              </PersonBall>
              {users.map((user) => {
                const { total, pct } = personAssignmentStats(nodes, colorBy, user.email);
                const active = employeeFilter === user.email;
                return (
                  <PersonBall
                    key={user.objectId}
                    label={`${user.name} — ${pct}% done (${total} assigned)`}
                    active={active}
                    pct={pct}
                    onClick={() => onEmployeeFilter(active ? null : user.email)}
                  >
                    <PersonFace name={user.name} email={user.email} />
                  </PersonBall>
                );
              })}
            </div>
          )}
        </div>
        {filtersHideAll ? (
          <p className="mt-2 mb-0 text-[11px] leading-snug text-[var(--muted)]">No nodes match the current filters.</p>
        ) : null}
        {groups.length ? (
          <div className="mt-2">
            <p className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">Groups</p>
            <GroupFilterPicker
              groups={groups}
              nodes={nodes}
              selected={groupFilters}
              onChange={onGroupFilters}
            />
            <button
              type="button"
              className="mt-1.5 cursor-pointer border-0 bg-transparent p-0 text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase hover:text-[var(--text)]"
              aria-expanded={manageGroups}
              onClick={() => setManageGroups((open) => !open)}
            >
              {manageGroups ? "▾" : "▸"} Manage groups
            </button>
            {manageGroups ? (
              <div className="mt-1.5">
                <GroupManager groups={groups} nodes={nodes} onUpdateGroup={onUpdateGroup} />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="border-t border-[var(--line)] pt-2 pb-0.5">
        <h2 className={cx(sideH2, "mb-1.5")}>View</h2>
        <p className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">Map</p>
        <SegmentedControl
          options={[
            { id: "fit", label: "Fit", title: "Fit the graph in the window" },
            { id: "reorg", label: "Reorg", title: "Apply force settings and let the map settle" },
            { id: "physics", label: "Physics", title: "Let nodes move and settle" },
          ]}
          pressed={settings.physics ? (["physics"] as const) : []}
          onSelect={(id) => {
            if (id === "fit") onFit();
            else if (id === "reorg") onReorg();
            else onTogglePhysics();
          }}
        />
        <p className="mt-2 mb-1 text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">Look</p>
        <SegmentedControl
          options={[
            { id: "text", label: "Text", title: "Show or hide node titles" },
            { id: "cards", label: "Cards", title: "Show info cards when zoomed in" },
          ]}
          pressed={[...(settings.showText ? (["text"] as const) : []), ...(settings.cardInfo ? (["cards"] as const) : [])]}
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
          <p className="mt-1 mb-0 text-[10px] text-[var(--muted)]">Turn on Physics to tune forces.</p>
        ) : null}
        {advanced && settings.physics ? (
          <div className="mt-1.5">
            <p className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">Forces</p>
            <ForceIntensityRow
              label="Spread"
              values={FORCE_INTENSITY.charge}
              value={settings.charge}
              titles={["Closest clusters", "Balanced", "Most spread"]}
              onChange={(charge) => onSettings({ charge })}
            />
            <ForceIntensityRow
              label="Link length"
              values={FORCE_INTENSITY.linkDistance}
              value={settings.linkDistance}
              titles={["Shortest links", "Balanced", "Longest links"]}
              onChange={(linkDistance) => onSettings({ linkDistance })}
            />
            <ForceIntensityRow
              label="Padding"
              values={FORCE_INTENSITY.collide}
              value={settings.collide}
              titles={["Least padding", "Balanced", "Most padding"]}
              onChange={(collide) => onSettings({ collide })}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ForceIntensityRow({
  label,
  values,
  value,
  titles,
  onChange,
}: {
  label: string;
  values: readonly number[];
  value: number;
  titles: readonly string[];
  onChange: (value: number) => void;
}) {
  const level = nearestForceLevel(values, value);
  return (
    <div className="my-1">
      <p className="mb-1 text-[11px] text-[var(--muted)]">{label}</p>
      <SegmentedControl
        options={FORCE_INTENSITY_IDS.map((id, index) => ({
          id,
          label: String(index + 1),
          title: titles[index] ?? `${label} ${index + 1}`,
        }))}
        value={FORCE_INTENSITY_IDS[level]}
        onSelect={(id) => {
          const index = FORCE_INTENSITY_IDS.indexOf(id);
          const next = values[index];
          if (next != null) onChange(next);
        }}
      />
    </div>
  );
}

function MouseHint() {
  return (
    <svg width="22" height="28" viewBox="0 0 22 28" aria-hidden className="shrink-0 text-[var(--text)]">
      <rect x="3" y="1.5" width="16" height="25" rx="8" fill="var(--input)" stroke="currentColor" strokeWidth="1.2" />
      <path d="M11 1.5 V12.2" stroke="currentColor" strokeWidth="1.1" />
      <path d="M3 12.2 H19" stroke="currentColor" strokeWidth="1.1" />
      <path d="M3 9.5 A8 8 0 0 1 11 1.5 V12.2 H3 Z" fill="var(--accent)" opacity="0.88" />
      <path d="M19 9.5 A8 8 0 0 0 11 1.5 V12.2 H19 Z" fill="currentColor" opacity="0.18" />
      <rect x="10.1" y="5.2" width="1.8" height="4.2" rx="0.9" fill="var(--card)" />
    </svg>
  );
}

function PersonBall({
  label,
  active,
  pct,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  pct: number;
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
        "relative size-8 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0 hover:brightness-105",
        active && "ring-1 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--card)]",
      )}
      onClick={onClick}
    >
      <span className="flex size-full items-center justify-center overflow-hidden rounded-full">{children}</span>
      <span className="absolute -right-0.5 -bottom-0.5 min-w-[16px] rounded-full border border-[var(--line)] bg-[var(--card)] px-px text-center text-[7px] font-bold leading-[12px] text-[var(--muted)]">
        {pct}%
      </span>
    </button>
  );
}
