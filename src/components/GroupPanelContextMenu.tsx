import { useEffect } from "react";
import { createPortal } from "react-dom";
import { handleOverlayWheel } from "../lib/overlayScroll";
import { ctxBox, cx } from "../styles";
import type { GraphGroup } from "../types";
import { GroupEditFields, type GroupEditPatch } from "./GroupManager";

type Props = {
  x: number;
  y: number;
  group: GraphGroup;
  memberCount: number;
  onUpdateGroup: (groupId: string, patch: GroupEditPatch) => void;
  onClose: () => void;
};

export default function GroupPanelContextMenu({ x, y, group, memberCount, onUpdateGroup, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pad = 8;
  const width = 248;
  const left = Math.min(Math.max(pad, x), window.innerWidth - width - pad);
  const top = Math.min(Math.max(pad, y), window.innerHeight - 160);

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[190] cursor-default border-0 bg-transparent p-0"
        aria-label="Close group menu"
        onClick={onClose}
      />
      <div
        className={cx("ctx", ctxBox, "fixed z-[191] rounded-lg p-2 shadow-lg")}
        style={{ left, top, width }}
        role="dialog"
        aria-label="Edit group"
        onWheel={handleOverlayWheel}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">Edit group</p>
        <GroupEditFields group={group} memberCount={memberCount} onUpdateGroup={onUpdateGroup} />
      </div>
    </>,
    document.body,
  );
}
