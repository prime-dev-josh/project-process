import { useMemo } from "react";
import { flowOutgoing, type DirectedFlow } from "../graph/flow";
import { groupTitle } from "../graph/groups";
import { WORKFLOW_STATUS_META, nodeWorkflowStatus } from "../graph/workflowStatus";
import { cx, field, fieldLabel, ghostBtn } from "../styles";
import type { GraphGroup, GraphLink, GraphNode } from "../types";
import HighlightFlowButton from "./HighlightFlowButton";

type Props = {
  originId: string;
  currentId: string;
  flow: DirectedFlow;
  nodes: GraphNode[];
  links: GraphLink[];
  groups: GraphGroup[];
  canBack: boolean;
  onClear: () => void;
  onBack: () => void;
  onStep: (id: string) => void;
};

export default function FlowHighlightPanel({
  originId,
  currentId,
  flow,
  nodes,
  links,
  groups,
  canBack,
  onClear,
  onBack,
  onStep,
}: Props) {
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const current = byId.get(currentId) ?? byId.get(originId);
  const hop = current ? (flow.hops.get(current.id) ?? 0) : 0;
  const nextIds = useMemo(() => {
    if (!current) return [];
    const ids = flowOutgoing(current.id, links, flow.hops);
    return ids.sort((a, b) => (byId.get(a)?.title ?? "").localeCompare(byId.get(b)?.title ?? ""));
  }, [byId, current, flow.hops, links]);
  const group = current?.groupId ? groups.find((item) => item.id === current.groupId) : undefined;
  const status = current
    ? WORKFLOW_STATUS_META.find((item) => item.id === nodeWorkflowStatus(current))?.label
    : null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
        <div className="mb-3 min-w-0">
          <h3 className="m-0 text-lg font-bold">Highlight flow</h3>
          <p className="mt-1 mb-0 text-[12px] text-[var(--muted)]">
            Step {hop + 1}
            {flow.maxHop > 0 ? ` · up to ${flow.maxHop + 1}` : ""}
          </p>
        </div>
        <HighlightFlowButton active onClick={onClear} />
        {canBack ? (
          <button type="button" className={cx(ghostBtn, "mt-2 w-full")} onClick={onBack}>
            Back
          </button>
        ) : null}

        {current ? (
          <section className="mt-5 flex min-w-0 flex-col gap-2">
            <label className={cx(fieldLabel, "mt-0 mb-0")}>Current</label>
            <div className="flex flex-col gap-1 rounded-lg border border-[var(--accent)] bg-[var(--input)] px-2.5 py-2.5">
              <p className="m-0 text-[14px] font-bold leading-snug">{current.title.trim() || "Untitled"}</p>
              {current.description.trim() ? (
                <p className="m-0 text-[12px] leading-snug text-[var(--muted)]">{current.description.trim()}</p>
              ) : null}
              <p className="m-0 text-[11px] text-[var(--muted)]">
                {[status, group ? groupTitle(group.title) : null, current.employee.trim() || null].filter(Boolean).join(" · ")}
              </p>
            </div>
          </section>
        ) : null}

        <section className="mt-5 flex min-w-0 flex-col gap-2">
          <label className={cx(fieldLabel, "mt-0 mb-0")}>{nextIds.length ? "Go to" : "End of this path"}</label>
          {nextIds.length ? (
            nextIds.map((id) => {
              const node = byId.get(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={cx(field, "flex cursor-pointer items-start gap-2 py-2.5 text-left hover:bg-[var(--hover)]")}
                  onClick={() => onStep(id)}
                >
                  <span className="mt-px shrink-0 text-[13px] font-bold text-[var(--accent)]" aria-hidden>
                    →
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold leading-snug">{node?.title.trim() || "Untitled"}</span>
                    {node?.description.trim() ? (
                      <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">
                        {node.description.trim()}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="m-0 text-[12px] leading-snug text-[var(--muted)]">No further nodes on this branch.</p>
          )}
        </section>
      </div>
    </div>
  );
}
