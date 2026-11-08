import { NextResponse, type NextRequest } from "next/server";
import { ensureAA, normalizeHex } from "@/lib/brand/contrast";
import { currentBranding, ownImage, saveBranding } from "@/lib/demo-cloud/branding";
import { DEMO_CLOUD } from "@/lib/demo-cloud/config";
import { jsonError, readJson } from "@/lib/demo-cloud/server";

type Context = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Saves the brand colour. Images go through ./[kind]. The colour is made AA-safe here too, so
 *  a direct request can't store one that makes guest buttons unreadable. */
export async function POST(request: NextRequest, { params }: Context) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const { id } = await params;
  if (!UUID.test(id)) return jsonError(404, "That venue no longer exists.");
  const body = (await readJson(request)) as Record<string, unknown> | null;
  let color: string | null = null;
  if (body?.color !== null && body?.color !== undefined) {
    const hex = typeof body.color === "string" ? normalizeHex(body.color) : null;
    if (!hex) return jsonError(422, "Enter a colour like #1d4ed8.");
    color = ensureAA(hex).color;
  }
  const current = await currentBranding(id);
  if (!current) return jsonError(404, "That venue no longer exists.");
  const saved = await saveBranding(request, id, {
    logoUrl: body && "logoUrl" in body ? ownImage(id, body.logoUrl) : current.logoUrl,
    coverUrl: body && "coverUrl" in body ? ownImage(id, body.coverUrl) : current.coverUrl,
    color,
  });
  return "refused" in saved ? saved.refused : NextResponse.json(saved);
}
