import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  /** 0 = notify parent on every input (e.g. discrete force ticks). */
  debounceMs?: number;
};

/** Keeps the thumb live while dragging; debounces continuous sliders, or applies instantly when debounceMs is 0. */
export default function SliderField({ label, min, max, step, value, onChange, debounceMs = 80 }: Props) {
  const [local, setLocal] = useState(value);
  const timer = useRef(0);
  const localRef = useRef(value);
  localRef.current = local;

  useEffect(() => {
    if (timer.current) return;
    setLocal(value);
  }, [value]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  function flush(next: number) {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = 0;
    }
    onChange(next);
  }

  return (
    <label className="my-1 flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
      <span>{label}</span>
      <input
        className="h-1 w-[88px] accent-[var(--accent)]"
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        onChange={(e) => {
          const next = Number(e.target.value);
          setLocal(next);
          if (debounceMs <= 0) {
            onChange(next);
            return;
          }
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => {
            timer.current = 0;
            onChange(next);
          }, debounceMs);
        }}
        onPointerUp={() => flush(localRef.current)}
        onKeyUp={() => flush(localRef.current)}
      />
    </label>
  );
}
