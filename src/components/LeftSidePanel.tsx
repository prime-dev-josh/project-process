import type { WorkflowStatus } from "../graph/workflowStatus";
import { handleOverlayWheel } from "../lib/overlayScroll";
import type { ColorBy, GraphGroup, GraphNode, GraphSettings } from "../types";
import FilterPanel from "./FilterPanel";

type Props = {
  search: string;
  statusFilters: WorkflowStatus[];
  employeeFilter: string | null;
  groups: GraphGroup[];
  groupFilters: string[];
  nodes: GraphNode[];
  settings: GraphSettings;
  colorBy: ColorBy;
  onSearch: (v: string) => void;
  onStatusFilters: (v: WorkflowStatus[]) => void;
  onEmployeeFilter: (v: string | null) => void;
  onGroupFilters: (v: string[]) => void;
  onClearFilters: () => void;
  onSettings: (patch: Partial<GraphSettings>) => void;
  onResetSettings: () => void;
  onFit: () => void;
  onReorg: () => void;
  onTogglePhysics: () => void;
  onUpdateGroup: (groupId: string, patch: { title?: string; color?: string }) => void;
};

export default function LeftSidePanel({
  search,
  statusFilters,
  employeeFilter,
  groups,
  groupFilters,
  nodes,
  settings,
  colorBy,
  onSearch,
  onStatusFilters,
  onEmployeeFilter,
  onGroupFilters,
  onClearFilters,
  onSettings,
  onResetSettings,
  onFit,
  onReorg,
  onTogglePhysics,
  onUpdateGroup,
}: Props) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--card)]">
      <div className="left-panel-top flex min-h-0 flex-1 flex-col overflow-hidden" onWheel={handleOverlayWheel}>
        <FilterPanel
          nodes={nodes}
          colorBy={colorBy}
          settings={settings}
          search={search}
          statusFilters={statusFilters}
          employeeFilter={employeeFilter}
          groups={groups}
          groupFilters={groupFilters}
          onSearch={onSearch}
          onStatusFilters={onStatusFilters}
          onEmployeeFilter={onEmployeeFilter}
          onGroupFilters={onGroupFilters}
          onClearFilters={onClearFilters}
          onSettings={onSettings}
          onResetSettings={onResetSettings}
          onFit={onFit}
          onReorg={onReorg}
          onTogglePhysics={onTogglePhysics}
          onUpdateGroup={onUpdateGroup}
        />
      </div>
    </div>
  );
}
