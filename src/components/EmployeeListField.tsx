import { useState } from "react";
import type { EmployeeAssignment } from "../schema/user";
import { cx } from "../styles";
import EmployeePicker from "./EmployeePicker";
import PersonFace from "./PersonFace";

type Props = {
  assignees: EmployeeAssignment[];
  ariaLabel?: string;
  onChange: (next: EmployeeAssignment[]) => void;
};

export default function EmployeeListField({ assignees, ariaLabel = "Assigned people", onChange }: Props) {
  const [adding, setAdding] = useState(false);

  function add(person: EmployeeAssignment) {
    if (!person.name && !person.email) return;
    const exists = assignees.some(
      (item) =>
        (person.email && item.email.toLowerCase() === person.email.toLowerCase()) ||
        (!person.email && item.name.toLowerCase() === person.name.toLowerCase()),
    );
    if (!exists) onChange([...assignees, person]);
    setAdding(false);
  }

  function remove(index: number) {
    onChange(assignees.filter((_, i) => i !== index));
  }

  return (
    <div className="min-w-0" aria-label={ariaLabel}>
      {assignees.length ? (
        <ul className="mb-1 flex flex-wrap gap-1">
          {assignees.map((person, index) => (
            <li key={`${person.email || person.name}-${index}`}>
              <button
                type="button"
                className="flex max-w-full items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--input)] py-[2px] pr-1.5 pl-[2px] text-left"
                title={`Remove ${person.name || person.email}`}
                aria-label={`Remove ${person.name || person.email}`}
                onClick={() => remove(index)}
              >
                <span className="size-5 shrink-0">
                  <PersonFace name={person.name} email={person.email} />
                </span>
                <span className="max-w-[7.5rem] truncate text-[10px] font-semibold text-[var(--text)]">
                  {person.name || person.email}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-1 text-[10px] text-[var(--muted)]">No people yet</p>
      )}
      {adding ? (
        <EmployeePicker name="" email="" emptyLabel="Add person" onChange={add} />
      ) : (
        <button
          type="button"
          className={cx(
            "w-full rounded-lg border border-dashed border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
          )}
          onClick={() => setAdding(true)}
        >
          Add person
        </button>
      )}
    </div>
  );
}
