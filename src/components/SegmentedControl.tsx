import { cx, toolBtn, toolBtnOn } from "../styles";

export type SegmentOption<T extends string> = {
  id: T;
  label: string;
  title?: string;
};

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value?: T | null;
  pressed?: Iterable<T>;
  onSelect: (id: T) => void;
};

export default function SegmentedControl<T extends string>({ options, value, pressed, onSelect }: Props<T>) {
  const on = new Set<T>(pressed ? [...pressed] : value != null ? [value] : []);
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          title={opt.title ?? opt.label}
          aria-pressed={on.has(opt.id)}
          className={cx(on.has(opt.id) ? toolBtnOn : toolBtn, "min-w-0 px-1.5")}
          onClick={() => onSelect(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}