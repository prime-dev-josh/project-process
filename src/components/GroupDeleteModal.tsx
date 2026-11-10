import { useEffect, useRef } from "react";
import type { GroupDeleteImpact } from "../graph/groupTree";
import { ghostBtn } from "../styles";

const NODE_LIST_CAP = 12;

type Props = {
  impact: GroupDeleteImpact;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function GroupDeleteModal({ impact, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const extraNodes = Math.max(0, impact.members.length - NODE_LIST_CAP);
  const shownNodes = impact.members.slice(0, NODE_LIST_CAP);
  const empty = impact.childCount === 0 && impact.memberCount === 0;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[rgba(12,16,24,0.45)] p-5"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="max-h-[min(80vh,640px)] w-[min(440px,100%)] overflow-auto rounded-[14px] border border-[var(--line)] bg-[var(--card)] px-4 pt-4 pb-3.5 shadow-[var(--shadow)]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="groupDeleteTitle"
        aria-describedby="groupDeleteBody"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="groupDeleteTitle" className="mt-0 mb-1.5 text-base text-[var(--accent)]">
          Delete {impact.title}?
        </h2>
        <p id="groupDeleteBody" className="mt-0 mb-3 text-[13px] leading-snug text-[var(--muted)]">
          {empty
            ? "This group has no nested groups or assigned nodes. This cannot be undone."
            : [
                `This removes ${summary(impact)}.`,
                impact.memberCount ? "Assigned nodes become ungrouped." : null,
                "This cannot be undone.",
              ]
                .filter(Boolean)
                .join(" ")}
        </p>
        {impact.nestedGroups.length ? (
          <ImpactList
            heading={`Nested groups (${impact.nestedGroups.length})`}
            items={impact.nestedGroups.map((group) => group.title)}
          />
        ) : null}
        {impact.members.length ? (
          <ImpactList
            heading={`Assigned nodes (${impact.memberCount})`}
            items={shownNodes.map((node) =>
              node.groupTitle === impact.title ? node.title : `${node.title} · ${node.groupTitle}`,
            )}
            footer={extraNodes ? `and ${extraNodes} more` : null}
          />
        ) : null}
        <div className="mt-3.5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" className={ghostBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-lg border border-red-600 bg-red-600 px-3 py-1.5 font-sans text-xs font-bold text-white"
            onClick={onConfirm}
          >
            Delete group
          </button>
        </div>
      </div>
    </div>
  );
}

function summary(impact: GroupDeleteImpact) {
  const bits = [
    impact.childCount ? `${impact.childCount} nested group${impact.childCount === 1 ? "" : "s"}` : "",
    impact.memberCount ? `${impact.memberCount} assigned node${impact.memberCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return bits.join(" and ");
}

function ImpactList({
  heading,
  items,
  footer,
}: {
  heading: string;
  items: string[];
  footer?: string | null;
}) {
  return (
    <section className="mb-3">
      <h3 className="mt-0 mb-1.5 text-[11px] font-bold tracking-wide text-[var(--muted)] uppercase">{heading}</h3>
      <ul className="mt-0 mb-0 max-h-40 list-none overflow-auto rounded-lg border border-[var(--line)] bg-[var(--input)] p-0">
        {items.map((item, index) => (
          <li
            key={`${item}-${index}`}
            className="border-b border-[var(--line)] px-2.5 py-1.5 text-[12px] leading-snug text-[var(--text)] last:border-b-0"
          >
            {item}
          </li>
        ))}
        {footer ? (
          <li className="px-2.5 py-1.5 text-[12px] leading-snug text-[var(--muted)]">{footer}</li>
        ) : null}
      </ul>
    </section>
  );
}
