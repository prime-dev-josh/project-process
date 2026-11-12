import { useState } from "react";
import { type WorkflowStatus } from "../graph/workflowStatus";
import {
  FORCE_INTENSITY,
  FORCE_LEVELS,
  LOOK_SCALE,
  nearestForceLevel,
} from "../graph/viewSettings";
import { cx, field, sideH2 } from "../styles";
import type { ColorBy, GraphGroup, GraphNode, GraphSettings } from "../types";
import type { GroupEditPatch } from "./GroupManager";
import GraphFilterFacets from "./GraphFilterFacets";
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
  onUpdateGroup: (groupId: string, patch: GroupEditPatch) => void;
};

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
  onUpdateGroup,
}: Props) {
  const [advanced, setAdvanced] = useState(false);
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
        <GraphFilterFacets
          nodes={nodes}
          groups={groups}
          colorBy={colorBy}
          search={search}
          statusFilters={statusFilters}
          employeeFilter={employeeFilter}
          groupFilters={groupFilters}
          onSearch={onSearch}
          onStatusFilters={onStatusFilters}
          onEmployeeFilter={onEmployeeFilter}
          onGroupFilters={onGroupFilters}
          onClearFilters={onClearFilters}
          onUpdateGroup={onUpdateGroup}
        />
      </section>

      <section className="flex min-h-0 flex-1 shrink-0 flex-col border-t border-[var(--line)] pb-0.5">
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
            <ForceIntensityRow
              label="Node"
              values={LOOK_SCALE.enlarge}
              value={settings.enlarge ?? 1}
              onChange={(enlarge) => onSettings({ enlarge })}
            />
            <ForceIntensityRow
              label="Text"
              values={LOOK_SCALE.textScale}
              value={settings.textScale ?? settings.enlarge ?? 1}
              onChange={(textScale) => onSettings({ textScale })}
            />
            <ForceIntensityRow
              label="Card"
              values={LOOK_SCALE.cardScale}
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
