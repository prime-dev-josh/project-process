import { useEffect, useState } from "react";
import { normalizeGroupColor } from "../graph/groups";
import { cx, field } from "../styles";

type Props = {
  value: string;
  onChange: (hex: string) => void;
  ariaLabel?: string;
};

export default function HexColorField({ value, onChange, ariaLabel = "Color" }: Props) {
  const hex = normalizeGroupColor(value) ?? "#94a3b8";
  const [text, setText] = useState(hex);

  useEffect(() => {
    setText(hex);
  }, [hex]);

  function commitText() {
    const next = normalizeGroupColor(text);
    if (!next || next === hex) {
      setText(hex);
      return;
    }
    onChange(next);
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <input
        type="color"
        className="h-7 w-8 shrink-0 cursor-pointer rounded-md border border-[var(--line)] bg-[var(--input)] p-0"
        value={hex}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
      />
      <input
        className={cx(field, "min-w-0 flex-1 py-[5px] font-mono text-[11px] uppercase tracking-wide")}
        value={text}
        spellCheck={false}
        aria-label={`${ariaLabel} hex`}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}
