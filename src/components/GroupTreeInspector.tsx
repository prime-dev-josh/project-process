import { cx, field, primaryBtn, sideH2 } from "../styles";
import type { ColorBy, GraphGroup, GraphNode } from "../types";
import type { WorkflowStatus } from "../graph/workflowStatus";
import type { GroupEditPatch } from "./GroupManager";
import GraphFilterFacets from "./GraphFilterFacets";

type Props = {
  groups: GraphGroup[];
  nodes: GraphNode[];
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
  onAddRoot: () => void;
  onUpdateGroup: (groupId: string, patch: GroupEditPatch) => void;
};

export default function GroupTreeInspector({
  groups,
  nodes,
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
  onAddRoot,
  onUpdateGroup,
}: Props) {
  return (
    <div className="filter-panel flex h-full min-h-0 flex-1 flex-col overflow-auto bg-[var(--card)]">
      <div className="flex-col p-2">
        <input
          className={cx(field, "mb-2 w-full")}
          type="search"
          placeholder="Search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
        <GraphFilterFacets
          showGroupFacet={false}
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
      </div>
      <section className="shrink-0 border-t border-[var(--line)] p-3">
        <h2 className={sideH2}>Groups</h2>
        <p className="mb-3 text-[11px] leading-snug text-[var(--muted)]">
          Folders organize the tree. Only groups without children can hold nodes on the map. Double-click a box or use
          the pencil to edit it.
        </p>
        <button type="button" className={cx(primaryBtn, "w-full")} onClick={onAddRoot}>
          Add root group
        </button>
      </section>
    </div>
  );
}
