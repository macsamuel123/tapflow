"use client";

import { useState, type FormEvent } from "react";
import { useDashboard } from "@/components/dashboard/DashboardContext";
import { Button, Card, FormError, LinkButton, Pill, SelectField, TextField } from "@/components/ui";
import {
  ACTION_LABELS,
  ACTIONS,
  can,
  DEFAULT_ROLE_LABELS,
  INVITE_NOTE,
  MAX_ROLE_LABEL,
  pinError,
  roleLabelError,
  ROLES,
  usesPin,
} from "@/lib/staff/permissions";
import { useData } from "@/lib/use-data";
import { SAMPLE_TEAM } from "@/lib/staff/sample-team";
import { getServices, type RoleLabels, type StaffMember, type StaffRole } from "@/services";

async function load() {
  const { staff } = getServices();
  const [members, labels] = await Promise.all([staff.list(), staff.roleLabels()]);
  return { members, labels };
}

function PinField({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (pin: string) => void }) {
  return (
    <TextField
      label={label}
      inputMode="numeric"
      autoComplete="off"
      maxLength={4}
      value={value}
      error={error}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
    />
  );
}

function absolute(url: string): string {
  return typeof window === "undefined" ? url : `${window.location.origin}${url}`;
}

function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          readOnly
          aria-label="Invite link"
          value={absolute(url)}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-gray-300 bg-gray-50 px-3 text-sm text-ink"
        />
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(absolute(url)).catch(() => undefined);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy invite link"}
        </Button>
      </div>
      <p className="text-xs text-gray-600">{INVITE_NOTE}.</p>
    </div>
  );
}

type Editing = { id: string; mode: "role" | "pin" } | null;

function MemberCard({
  member,
  labels,
  editing,
  onEdit,
  run,
}: {
  member: StaffMember;
  labels: RoleLabels;
  editing: Editing;
  onEdit: (editing: Editing) => void;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
}) {
  const { staff } = getServices();
  const [role, setRole] = useState<StaffRole>(member.role);
  const [pin, setPin] = useState("");
  const [attempted, setAttempted] = useState(false);
  const mode = editing?.id === member.id ? editing.mode : null;
  const needsPin = mode === "pin" || (mode === "role" && usesPin(role) && !member.hasPin);
  const pinProblem = needsPin ? pinError(pin) : null;
  const { accountOwner } = member;

  async function save(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (pinProblem) return;
    const done =
      mode === "pin"
        ? await run(() => staff.resetPin(member.id, pin))
        : await run(() => staff.setRole(member.id, role, needsPin ? pin : null));
    if (done) {
      onEdit(null);
      setPin("");
      setAttempted(false);
    }
  }

  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{member.name}</p>
          <p className="text-sm text-gray-600">
            {usesPin(member.role) ? (member.hasPin ? "Signs in with a PIN" : "No PIN yet") : "Signs in with an account"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Pill tone={member.role === "owner" ? "green" : "blue"}>{labels[member.role]}</Pill>
          {member.active ? null : <Pill tone="gray">Deactivated</Pill>}
        </div>
      </div>
      {member.inviteUrl && member.active && !accountOwner ? <InviteLink url={member.inviteUrl} /> : null}
      {member.active && !accountOwner ? (
        mode ? (
          <form onSubmit={(e) => void save(e)} noValidate className="space-y-2">
            {mode === "role" ? (
              <SelectField label={`New role for ${member.name}`} value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{labels[r]}</option>
                ))}
              </SelectField>
            ) : null}
            {needsPin ? (
              <PinField label={`New 4-digit PIN for ${member.name}`} value={pin} error={attempted ? (pinProblem ?? undefined) : undefined} onChange={setPin} />
            ) : null}
            <div className="flex gap-2">
              <Button type="submit">{mode === "pin" ? "Save PIN" : "Save role"}</Button>
              <Button variant="secondary" onClick={() => onEdit(null)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" aria-label={`Edit role for ${member.name}`} onClick={() => onEdit({ id: member.id, mode: "role" })}>
              Edit role
            </Button>
            {usesPin(member.role) ? (
              <Button variant="secondary" aria-label={`Reset PIN for ${member.name}`} onClick={() => onEdit({ id: member.id, mode: "pin" })}>
                Reset PIN
              </Button>
            ) : null}
            <Button variant="danger" aria-label={`Deactivate ${member.name}`} onClick={() => void run(() => staff.deactivate(member.id))}>
              Deactivate
            </Button>
          </div>
        )
      ) : null}
    </Card>
  );
}

function AddStaff({ labels, run }: { labels: RoleLabels; run: (action: () => Promise<unknown>) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("fulfillment");
  const [pin, setPin] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [invite, setInvite] = useState<{ name: string; url: string } | null>(null);
  const pinRole = usesPin(role);
  const errors = {
    name: name.trim() ? undefined : "Enter a name.",
    pin: pinRole ? (pinError(pin) ?? undefined) : undefined,
  };

  async function add(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (errors.name || errors.pin) return;
    let added: StaffMember | null = null;
    const ok = await run(async () => {
      added = await getServices().staff.add({ name: name.trim(), role, pin: pinRole ? pin : null });
    });
    if (!ok) return;
    const member = added as StaffMember | null;
    setInvite(member?.inviteUrl ? { name: member.name, url: member.inviteUrl } : null);
    setName("");
    setPin("");
    setAttempted(false);
  }

  return (
    <Card>
      <form onSubmit={(e) => void add(e)} noValidate className="space-y-3">
        <h2 className="text-lg font-bold text-ink">Add staff</h2>
        <TextField label="Name" maxLength={60} value={name} error={attempted ? errors.name : undefined} onChange={(e) => setName(e.target.value)} />
        <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>{labels[r]}</option>
          ))}
        </SelectField>
        {pinRole ? (
          <PinField
            label="4-digit PIN"
            value={pin}
            error={attempted ? errors.pin : undefined}
            onChange={setPin}
          />
        ) : (
          <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {labels[role]} signs in with an account. You&apos;ll get an invite link to share. {INVITE_NOTE}.
          </p>
        )}
        <Button type="submit">Add staff</Button>
        {invite ? (
          <div role="status" className="space-y-1 rounded-xl bg-brand-50 p-3">
            <p className="text-sm font-semibold text-brand-800">Invite link for {invite.name}</p>
            <InviteLink url={invite.url} />
          </div>
        ) : null}
      </form>
    </Card>
  );
}

function Matrix({ labels }: { labels: RoleLabels }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-ink">What each role can do</h2>
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table aria-label="Permissions" className="w-full text-left text-xs">
          <thead>
            <tr className="border-b">
              <th scope="col" className="sticky left-0 bg-white p-2 font-semibold text-ink">Action</th>
              {ROLES.map((r) => (
                <th key={r} scope="col" className="p-2 text-center font-semibold whitespace-nowrap text-ink">{labels[r]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ACTIONS.map((action) => (
              <tr key={action} className="border-b last:border-0">
                <th scope="row" className="sticky left-0 bg-white p-2 font-medium whitespace-nowrap text-gray-700">{ACTION_LABELS[action]}</th>
                {ROLES.map((r) => (
                  <td key={r} className="p-2 text-center">
                    {can(r, action) ? <span aria-label="Yes" className="font-bold text-brand-700">✓</span> : <span aria-label="No" className="text-gray-300">–</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RoleNames({ labels, run }: { labels: RoleLabels; run: (action: () => Promise<unknown>) => Promise<boolean> }) {
  const [drafts, setDrafts] = useState<RoleLabels>(labels);
  const [saved, setSaved] = useState("");
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-bold text-ink">Role names</h2>
      <p className="text-sm text-gray-600">Rename a role to match your venue. Names are labels only: what a role can do stays the same.</p>
      {ROLES.map((role) => {
        const problem = roleLabelError(drafts[role]);
        return (
          <form
            key={role}
            noValidate
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (problem) return;
              void run(() => getServices().staff.renameRole(role, drafts[role])).then((ok) => {
                if (ok) setSaved(`Saved: ${drafts[role].trim()}`);
              });
            }}
          >
            <TextField
              className="flex-1"
              label={`Display name for ${DEFAULT_ROLE_LABELS[role]}`}
              maxLength={MAX_ROLE_LABEL}
              value={drafts[role]}
              error={problem ?? undefined}
              onChange={(e) => {
                setDrafts({ ...drafts, [role]: e.target.value });
                setSaved("");
              }}
            />
            <Button type="submit" variant="secondary" aria-label={`Save name for ${DEFAULT_ROLE_LABELS[role]}`}>Save</Button>
          </form>
        );
      })}
      <p role="status" className="text-sm font-medium text-brand-800">{saved}</p>
    </Card>
  );
}

export default function StaffPage() {
  const { venue } = useDashboard();
  const { data, error, run } = useData(load);
  const [editing, setEditing] = useState<Editing>(null);
  const samplePins = SAMPLE_TEAM.filter((m) => m.pin)
    .map((m) => `${m.name.split(" ")[0]} ${m.pin}`)
    .join(", ");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-ink">Staff</h1>
      <Card className="space-y-2">
        <h2 className="text-lg font-bold text-ink">Staff mode</h2>
        <p className="text-sm text-gray-600">
          Open this on a shared device. Staff sign in with their PIN and see only what their role allows.
        </p>
        <p className="text-xs text-gray-600">Demo: the sample team&apos;s PINs are {samplePins}, unless you changed them.</p>
        <LinkButton href={`/staff/${venue.slug}`} variant="secondary">Open staff mode</LinkButton>
      </Card>
      <FormError message={error} />
      {data ? (
        <>
          <ul aria-label="Team" className="space-y-2">
            {data.members.map((member) => (
              <li key={member.id}>
                <MemberCard member={member} labels={data.labels} editing={editing} onEdit={setEditing} run={run} />
              </li>
            ))}
          </ul>
          <AddStaff labels={data.labels} run={run} />
          <Matrix labels={data.labels} />
          <RoleNames labels={data.labels} run={run} />
        </>
      ) : null}
    </div>
  );
}
