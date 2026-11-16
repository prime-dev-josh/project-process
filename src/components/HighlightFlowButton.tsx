import { cx, primaryBtn } from "../styles";

type Props = {
  active?: boolean;
  onClick: () => void;
  /** Full orange fill — use in the node context menu so the action is obvious. */
  emphasized?: boolean;
};

function FlowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <circle cx="3" cy="8" r="2" fill="currentColor" />
      <circle cx="13" cy="4" r="2" fill="currentColor" />
      <circle cx="13" cy="12" r="2" fill="currentColor" />
      <path
        d="M5 8 H8 M8 8 L11 4.6 M8 8 L11 11.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function HighlightFlowButton({ active = false, onClick, emphasized = false }: Props) {
  const title = active ? "Stop flow mode and return to normal map view" : "Dim off-path nodes and step downstream in the left panel";
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      className={cx(
        "flex w-full cursor-pointer items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left font-sans shadow-[var(--shadow)]",
        active
          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--brand-ink)] hover:brightness-110"
          : emphasized
            ? cx(primaryBtn, "items-center py-2.5")
            : "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_20%,var(--input))] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--accent)_32%,var(--input))]",
      )}
      onClick={onClick}
    >
      <FlowIcon />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold leading-snug">{active ? "Clear flow highlight" : "Follow flow from here"}</span>
        {!active ? (
          <span
            className={cx(
              "mt-0.5 block text-[10px] leading-snug",
              emphasized ? "text-[var(--brand-ink)] opacity-90" : "text-[var(--muted)]",
            )}
          >
            Pulse the path · pick next steps in the left rail
          </span>
        ) : null}
      </span>
    </button>
  );
}