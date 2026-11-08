import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { currentBranding, removeBrandImage, saveBranding } from "@/lib/demo-cloud/branding";
import { BRANDING_BUCKET, DEMO_CLOUD, MAX_PHOTO_UPLOAD_BYTES } from "@/lib/demo-cloud/config";
import { adminClient, jsonError } from "@/lib/demo-cloud/server";
import { requireOwner } from "@/lib/demo-cloud/venues";

type Context = { params: Promise<{ id: string; kind: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FIELDS = { logo: "logoUrl", cover: "coverUrl" } as const;

function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function target(request: NextRequest, { params }: Context) {
  if (!DEMO_CLOUD) return { refused: jsonError(404, "Not found") };
  const { id, kind } = await params;
  if (!UUID.test(id) || (kind !== "logo" && kind !== "cover")) return { refused: jsonError(404, "Not found") };
  const refused = await requireOwner(request, id);
  if (refused) return { refused };
  const current = await currentBranding(id);
  if (!current) return { refused: jsonError(404, "That venue no longer exists.") };
  return { id, field: FIELDS[kind], current };
}

/** A logo or cover: the same JPEG checks and size limit as menu photos. */
export async function POST(request: NextRequest, context: Context) {
  const found = await target(request, context);
  if ("refused" in found) return found.refused;
  const { id, field, current } = found;

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_PHOTO_UPLOAD_BYTES) return jsonError(413, "That image is too large.");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_PHOTO_UPLOAD_BYTES) return jsonError(413, "That image is too large.");
  if (!isJpeg(bytes)) return jsonError(415, "That file isn't a JPEG image.");

  const bucket = adminClient().storage.from(BRANDING_BUCKET);
  const path = `${id}/${field === "logoUrl" ? "logo" : "cover"}-${randomUUID()}.jpg`;
  const upload = await bucket.upload(path, bytes, { contentType: "image/jpeg" });
  if (upload.error) return jsonError(500, "That image couldn't be saved.");
  const url = bucket.getPublicUrl(path).data.publicUrl;
  const saved = await saveBranding(request, id, { ...current, [field]: url });
  if ("refused" in saved) {
    await removeBrandImage(id, url);
    return saved.refused;
  }
  await removeBrandImage(id, current[field]);
  return NextResponse.json(saved, { status: 201 });
}

export async function DELETE(request: NextRequest, context: Context) {
  const found = await target(request, context);
  if ("refused" in found) return found.refused;
  const { id, field, current } = found;
  const saved = await saveBranding(request, id, { ...current, [field]: null });
  if ("refused" in saved) return saved.refused;
  await removeBrandImage(id, current[field]);
  return NextResponse.json(saved);
}
