import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useStore } from "@tanstack/react-store";
import { nodeColor } from "../graph/colors";
import {
  STATUS_COLORS,
  WORKFLOW_STATUS_META,
  nodeWorkflowStatus,
} from "../graph/workflowStatus";
import { handleOverlayWheel } from "../lib/overlayScroll";
import { draftStore } from "../store/drafts";
import { cx, editFloat, field, fieldArea, fieldLabel, swatch, swatchOn } from "../styles";
import type { ColorBy, GraphGroup, GraphNode } from "../types";
import DeferredTextField from "./DeferredTextField";
import EmployeePicker from "./EmployeePicker";
import GroupPicker from "./GroupPicker";
import ClassPicker from "./ClassPicker";
import HighlightFlowButton from "./HighlightFlowButton";

export type NodeEditPreview = {
  size: number;
  color?: string;
};

export type NodeEditPatch = {
  title: string;
  description: string;
  size: number;
  color?: string;
  employee: string;
  employeeEmail: string;
  groupId: string | null;
};

export type EditNodePanelVariant = "float" | "embedded";

type Props = {
  node: GraphNode;
  nodes: GraphNode[];
  groups: GraphGroup[];
  colorBy: ColorBy;
  variant?: EditNodePanelVariant;
  style?: CSSProperties;
  flowHighlighted?: boolean;
  onHighlightFlow?: () => void;
  onSave: (patch: Partial<NodeEditPatch>) => void;
};

const SAVED_FLASH_MS = 1600;
const editSectionLabel = cx(fieldLabel, "mt-0 mb-0");

export default function EditNodePanel({
  node,
  nodes,
  groups,
  colorBy,
  variant = "float",
  style,
  flowHighlighted = false,
  onHighlightFlow,
  onSave,
}: Props) {
  const accent = nodeColor(node, colorBy);
  const unsaved = useStore(draftStore, (s) => s.labels);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
  }, []);

  function save(patch: Partial<NodeEditPatch>) {
    onSave(patch);
    setSavedFlash(true);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
  }

  const status = unsaved.length
    ? { tone: "text-amber-500", text: `Unsaved: ${unsaved.join(", ")}` }
    : savedFlash
      ? { tone: "text-emerald-500", text: "Saved" }
      : { tone: "text-[var(--muted)]", text: "All changes saved" };

  const statusSection = (
    <section className="flex min-w-0 flex-col gap-2">
      <label className={editSectionLabel}>
        Status <span className="font-normal normal-case tracking-normal">· saves instantly</span>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {WORKFLOW_STATUS_META.map(({ id, label }) => {
          const c = STATUS_COLORS[id];
          const active = nodeWorkflowStatus(node, colorBy) === id;
          return (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={active}
              className={cx(swatch, active && swatchOn)}
              style={{ background: c }}
              onClick={() => save({ color: c })}
            />
          );
        })}
      </div>
    </section>
  );

  const titleSection = (
    <section className="flex min-w-0 flex-col gap-2">
      <label className={editSectionLabel} htmlFor={`title-${node.id}`}>
        Title <span className="font-normal normal-case tracking-normal">· Enter to save, Esc to reset</span>
      </label>
      <DeferredTextField
        id={`title-${node.id}`}
        label="Title"
        className={field}
        value={node.title}
        onCommit={(title) => save({ title })}
      />
    </section>
  );

  const descriptionSection = (
    <section className="flex min-w-0 flex-col gap-2">
      <label className={editSectionLabel} htmlFor={`desc-${node.id}`}>
        Description <span className="font-normal normal-case tracking-normal">· Ctrl+Enter to save</span>
      </label>
      <DeferredTextField
        id={`desc-${node.id}`}
        label="Description"
        multiline
        className={fieldArea}
        rows={3}
        value={node.description}
        onCommit={(description) => save({ description })}
      />
    </section>
  );

  const employeeSection = (
    <section className="flex min-w-0 flex-col gap-2">
      <label className={editSectionLabel}>
        Assigned employee <span className="font-normal normal-case tracking-normal">· saves instantly</span>
      </label>
      <EmployeePicker
        name={node.employee ?? ""}
        email={node.employeeEmail ?? ""}
        onChange={(next) => save({ employee: next.name, employeeEmail: next.email })}
      />
    </section>
  );

  const groupSection = (
    <section className="flex min-w-0 flex-col gap-2">
      <label className={editSectionLabel}>
        Group <span className="font-normal normal-case tracking-normal">· saves instantly</span>
      </label>
      <GroupPicker
        groupId={node.groupId ?? null}
        groups={groups}
        nodes={nodes}
        onChange={(groupId) => {
          if ((node.groupId ?? null) !== groupId) save({ groupId });
        }}
      />
    </section>
  );

  const classSection = (
    <section className="flex min-w-0 flex-col gap-2">
      <label className={editSectionLabel}>
        Class <span className="font-normal normal-case tracking-normal">· saves instantly</span>
      </label>
      <ClassPicker value={node.size} onSelect={(size) => save({ size })} />
    </section>
  );

  const shellClass =
    variant === "embedded"
      ? "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-4"
      : `${editFloat} is-tinted left-3 bottom-3 max-h-[calc(100vh-76px)] overflow-auto`;

  return (
    <div
      className={shellClass}
      style={{ ...style, ["--edit-accent" as string]: accent }}
      onWheel={handleOverlayWheel}
    >
      <div className="mb-3 flex min-w-0 items-baseline justify-between gap-2">
        <h3 className="m-0 shrink-0 text-lg font-bold">Modify Node</h3>
        <span className={cx("truncate text-[11px] font-semibold", status.tone)} role="status" aria-live="polite">
          {status.text}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        {onHighlightFlow ? <HighlightFlowButton active={flowHighlighted} onClick={onHighlightFlow} /> : null}
        {statusSection}
        {titleSection}
        {descriptionSection}
        {employeeSection}
        {groupSection}
        {classSection}
      </div>
    </div>
  );
}
