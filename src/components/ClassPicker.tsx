import { NODE_CLASS_META, nodeClassFromSize, sizeFromNodeClass, type NodeClass } from "../graph/nodeClass";
import { cx } from "../styles";

function ClassGlyph({ cls }: { cls: NodeClass }) {
  const fill = "currentColor";
  if (cls === "start") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="block">
        <path d="M8 5.2 L19.2 12 L8 18.8 Z" fill={fill} />
      </svg>
    );
  }
  if (cls === "end") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="block">
        <rect x="5.5" y="5.5" width="13" height="13" rx="3" fill={fill} />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="block">
      <circle cx="12" cy="12" r="6.5" fill={fill} />
    </svg>
  );
}

type Props = {
  value?: number;
  accent?: string;
  compact?: boolean;
  onSelect: (size: number) => void;
};

export default function ClassPicker({ value, accent, compact = false, onSelect }: Props) {
  const selected = value === undefined ? null : nodeClassFromSize(value);
  return (
    <div
      className={cx("grid grid-cols-3", compact ? "gap-1" : "gap-1.5")}
      style={accent ? { ["--edit-accent" as string]: accent } : undefined}
      role="group"
      aria-label="Node class"
    >
      {NODE_CLASS_META.map(({ id, label }) => {
        const on = selected === id;
        return (
          <button
            key={id}
            type="button"
            className={cx(
              "flex cursor-pointer flex-col items-center justify-center border border-[var(--line)] bg-[var(--input)] font-sans text-[var(--muted)]",
              compact ? "gap-0.5 rounded-md px-1 py-1" : "gap-1 rounded-lg px-1.5 py-[7px]",
              on
                ? "border-[var(--edit-accent,var(--accent))] bg-[color-mix(in_srgb,var(--edit-accent,var(--accent))_18%,var(--input))] text-[var(--text)]"
                : "hover:bg-[var(--hover)] hover:text-[var(--text)]",
            )}
            title={label}
            aria-label={label}
            aria-pressed={on}
            onClick={() => onSelect(sizeFromNodeClass(id))}
          >
            <ClassGlyph cls={id} />
            <span className={cx("font-semibold leading-none tracking-wide", compact ? "text-[8px]" : "text-[9px]")}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
