# Table Order: QR ordering MVP

Diners scan a table QR code, order and pay with Stripe. The kitchen gets the ticket on a live display, and a server delivers it to the table.

- Architecture, decisions and roadmap: [PLAN.md](PLAN.md)
- Commands, conventions and invariants: [CLAUDE.md](CLAUDE.md)

## Quick start (WSL2 Ubuntu)

Prerequisites (see PLAN.md §7):
- Node 22 + pnpm
- uv (Python 3.12)
- `make`
- Docker Desktop with WSL integration enabled

```bash
make install
cp api/.env.example api/.env
cp web/.env.example web/.env.local   # fill NEXT_PUBLIC_SUPABASE_ANON_KEY from `pnpm exec supabase status`
make dev                              # Supabase + API :8000 + web :3000
make qr-urls                          # signed table URLs for Demo Bistro
make test                             # pytest + pgTAP
```

Local services:
- Web: http://localhost:3000
- API: http://localhost:8000/docs
- Supabase Studio: http://localhost:54323
- Magic-link inbox (Inbucket/Mailpit): http://localhost:54324

Demo staff logins (magic link): `owner@demo.test`, `kitchen@demo.test`.

The full README (architecture diagram and demo script) comes in M4.
