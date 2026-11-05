import type { CSSProperties } from "react";
import { nodeColor } from "../graph/colors";
import type { WorkflowStatus } from "../graph/workflowStatus";
import { handleOverlayWheel } from "../lib/overlayScroll";
import { cx } from "../styles";
import type { ColorBy, GraphGroup, GraphNode, GraphSettings } from "../types";
import EditNodePanel, { type NodeEditPatch } from "./EditNodePanel";
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
  editingNode: GraphNode | null;
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
  onToggleCards: () => void;
  onNodeSave: (patch: Partial<NodeEditPatch>) => void;
  onCreateGroup: (title: string) => void;
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
  editingNode,
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
  onToggleCards,
  onNodeSave,
  onCreateGroup,
  onUpdateGroup,
}: Props) {
  const accent = editingNode ? nodeColor(editingNode, colorBy) : undefined;

  const viewReplacement = editingNode ? (
    <div
      className={cx("left-panel-edit is-tinted flex min-h-0 flex-1 flex-col overflow-hidden")}
      style={accent ? ({ ["--edit-accent" as string]: accent } as CSSProperties) : undefined}
    >
      <EditNodePanel
        key={editingNode.id}
        embedded
        node={editingNode}
        nodes={nodes}
        groups={groups}
        colorBy={colorBy}
        onSave={onNodeSave}
        onCreateGroup={onCreateGroup}
        onUpdateGroup={onUpdateGroup}
      />
    </div>
  ) : undefined;

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
          onToggleCards={onToggleCards}
          selectedNodeId={editingNode?.id ?? null}
          onUpdateGroup={onUpdateGroup}
          viewReplacement={viewReplacement}
        />
      </div>
    </div>
  );
}
