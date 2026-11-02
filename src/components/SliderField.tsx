type Props = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
};

export default function SliderField({ label, min, max, step, value, onChange }: Props) {
  return (
    <label className="my-1 flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
      <span>{label}</span>
      <input
        className="h-1 w-[88px] accent-[var(--accent)]"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}