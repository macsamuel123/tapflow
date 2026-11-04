"use client";

import { useState, type FormEvent } from "react";
import { Button, Card, FormError, Pill, SelectField, TextField } from "@/components/ui";
import { useData } from "@/lib/use-data";
import { emailError } from "@/lib/validation";
import { getServices, type StaffRole } from "@/services";

const ROLES: { value: StaffRole; label: string; body: string }[] = [
  { value: "owner", label: "Owner", body: "Everything, including payouts and Stripe settings." },
  { value: "manager", label: "Manager", body: "All orders and history, but no payouts or Stripe settings." },
  { value: "fulfillment", label: "Fulfillment", body: "Active orders, plus orders closed today." },
  { value: "runner", label: "Runner", body: "Orders that are ready to deliver." },
];

const ASSIGNABLE = ROLES.filter((r) => r.value !== "owner");

export default function StaffPage() {
  const { data, error, run } = useData(() => getServices().staff.list());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("fulfillment");
  const [attempted, setAttempted] = useState(false);
  const errors = { name: name.trim() ? undefined : "Enter a name.", email: emailError(email) };

  async function invite(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (errors.name || errors.email) return;
    if (await run(() => getServices().staff.invite({ name: name.trim(), email: email.trim(), role }))) {
      setName("");
      setEmail("");
      setAttempted(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-ink">Staff</h1>
      <FormError message={error} />
      <ul className="space-y-2">
        {data?.map((member) => (
          <li key={member.id}>
            <Card className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{member.name}</p>
                  <p className="truncate text-sm text-gray-600">{member.email}</p>
                </div>
                {member.role === "owner" ? <Pill tone="green">Owner</Pill> : null}
              </div>
              {member.role === "owner" ? null : (
                <div className="flex items-end gap-2">
                  <SelectField
                    label={`Role for ${member.name}`}
                    className="flex-1"
                    value={member.role}
                    onChange={(e) => void run(() => getServices().staff.setRole(member.id, e.target.value as StaffRole))}
                  >
                    {ASSIGNABLE.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </SelectField>
                  <Button variant="danger" onClick={() => void run(() => getServices().staff.remove(member.id))}>Remove</Button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>

      <Card>
        <form onSubmit={(e) => void invite(e)} noValidate className="space-y-3">
          <h2 className="text-lg font-bold text-ink">Invite someone</h2>
          <TextField label="Name" value={name} error={attempted ? errors.name : undefined} onChange={(e) => setName(e.target.value)} />
          <TextField label="Email" type="email" value={email} error={attempted ? errors.email : undefined} onChange={(e) => setEmail(e.target.value)} />
          <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            {ASSIGNABLE.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </SelectField>
          <Button type="submit">Add to team</Button>
        </form>
      </Card>

      <section>
        <h2 className="text-lg font-bold text-ink">What each role can do</h2>
        <dl className="mt-2 space-y-2">
          {ROLES.map((r) => (
            <div key={r.value}>
              <dt className="font-semibold text-ink">{r.label}</dt>
              <dd className="text-sm text-gray-600">{r.body}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
