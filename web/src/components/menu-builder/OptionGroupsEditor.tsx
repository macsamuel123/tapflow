"use client";

import { Button, SelectField, TextField, YesNo } from "@/components/ui";
import { optionGroupError, type OptionGroupForm } from "@/lib/menu/rules";

function newOption() {
  return { id: crypto.randomUUID(), name: "", price: "0.00" };
}

function newGroup(): OptionGroupForm {
  return {
    id: crypto.randomUUID(),
    name: "",
    required: false,
    minPicks: "0",
    maxPicks: "1",
    options: [newOption()],
  };
}

function GroupEditor({
  index,
  group,
  showErrors,
  onChange,
  onRemove,
}: {
  index: number;
  group: OptionGroupForm;
  showErrors: boolean;
  onChange: (group: OptionGroupForm) => void;
  onRemove: () => void;
}) {
  const error = showErrors ? optionGroupError(group) : undefined;
  const patch = (change: Partial<OptionGroupForm>) => onChange({ ...group, ...change });
  const pickOne = group.maxPicks === "1";

  function setRequired(required: boolean) {
    // The minimum follows `required`, as the database requires: optional means 0.
    patch({ required, minPicks: required ? (group.minPicks === "0" ? "1" : group.minPicks) : "0" });
  }

  function setPickType(type: string) {
    const many = type === "many";
    const maxPicks = many ? String(Math.max(group.options.length, 2)) : "1";
    patch({ maxPicks, minPicks: group.required ? "1" : "0" });
  }

  return (
    <fieldset className="space-y-3 rounded-xl border border-gray-200 p-3">
      <legend className="px-1 text-sm font-semibold text-ink">Option group {index + 1}</legend>
      <TextField label="Group name" placeholder="Size" maxLength={80} value={group.name} onChange={(e) => patch({ name: e.target.value })} />
      <YesNo legend="Required?" name={`required-${group.id}`} value={group.required} onChange={setRequired} />
      <SelectField label="Guests can" value={pickOne ? "one" : "many"} onChange={(e) => setPickType(e.target.value)}>
        <option value="one">Pick one</option>
        <option value="many">Pick many</option>
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Min picks"
          inputMode="numeric"
          disabled={!group.required}
          hint={group.required ? undefined : "0 for an optional group"}
          value={group.minPicks}
          onChange={(e) => patch({ minPicks: e.target.value })}
        />
        <TextField label="Max picks" inputMode="numeric" value={group.maxPicks} onChange={(e) => patch({ maxPicks: e.target.value })} />
      </div>

      <div className="space-y-3">
        {group.options.map((option, i) => {
          const setOption = (change: Partial<typeof option>) =>
            patch({ options: group.options.map((o) => (o.id === option.id ? { ...o, ...change } : o)) });
          return (
            <div key={option.id} className="flex items-end gap-2">
              <TextField label={`Option ${i + 1} name`} className="min-w-0 flex-1" maxLength={80} value={option.name} onChange={(e) => setOption({ name: e.target.value })} />
              <TextField label="Add-on price" className="w-24" inputMode="decimal" value={option.price} onChange={(e) => setOption({ price: e.target.value })} />
              <Button
                variant="ghost"
                aria-label={`Remove option ${i + 1}`}
                onClick={() => patch({ options: group.options.filter((o) => o.id !== option.id) })}
              >
                ✕
              </Button>
            </div>
          );
        })}
      </div>

      {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => patch({ options: [...group.options, newOption()] })}>Add option</Button>
        <Button variant="danger" onClick={onRemove}>Remove group</Button>
      </div>
    </fieldset>
  );
}

export function OptionGroupsEditor({
  groups,
  showErrors,
  onChange,
}: {
  groups: OptionGroupForm[];
  showErrors: boolean;
  onChange: (groups: OptionGroupForm[]) => void;
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-ink">Options</h3>
      {groups.map((group, i) => (
        <GroupEditor
          key={group.id}
          index={i}
          group={group}
          showErrors={showErrors}
          onChange={(next) => onChange(groups.map((g) => (g.id === group.id ? next : g)))}
          onRemove={() => onChange(groups.filter((g) => g.id !== group.id))}
        />
      ))}
      <Button variant="secondary" onClick={() => onChange([...groups, newGroup()])}>Add option group</Button>
    </section>
  );
}
