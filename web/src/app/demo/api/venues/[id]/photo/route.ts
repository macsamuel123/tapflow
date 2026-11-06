import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CLOUD, MAX_PHOTO_UPLOAD_BYTES, MAX_VENUE_PHOTOS, PHOTO_BUCKET } from "@/lib/demo-cloud/config";
import { adminClient, jsonError } from "@/lib/demo-cloud/server";
import { requireOwner } from "@/lib/demo-cloud/venues";

type Context = { params: Promise<{ id: string }> };

function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export async function POST(request: NextRequest, { params }: Context) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const { id } = await params;
  const refused = await requireOwner(request, id);
  if (refused) return refused;

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_PHOTO_UPLOAD_BYTES) return jsonError(413, "That photo is too large.");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_PHOTO_UPLOAD_BYTES) return jsonError(413, "That photo is too large.");
  if (!isJpeg(bytes)) return jsonError(415, "That file isn't a JPEG photo.");

  const bucket = adminClient().storage.from(PHOTO_BUCKET);
  const existing = await bucket.list(id, { limit: MAX_VENUE_PHOTOS + 1 });
  if ((existing.data?.length ?? 0) >= MAX_VENUE_PHOTOS) {
    return jsonError(422, `A venue can have up to ${MAX_VENUE_PHOTOS} photos.`);
  }
  const path = `${id}/${randomUUID()}.jpg`;
  const { error } = await bucket.upload(path, bytes, { contentType: "image/jpeg" });
  if (error) return jsonError(500, "That photo couldn't be saved.");
  return NextResponse.json({ url: bucket.getPublicUrl(path).data.publicUrl }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: Context) {
  if (!DEMO_CLOUD) return jsonError(404, "Not found");
  const { id } = await params;
  const refused = await requireOwner(request, id);
  if (refused) return refused;
  const name = request.nextUrl.searchParams.get("name") ?? "";
  if (!/^[0-9a-f-]{36}\.jpg$/.test(name)) return jsonError(404, "That photo no longer exists.");
  await adminClient().storage.from(PHOTO_BUCKET).remove([`${id}/${name}`]);
  return NextResponse.json({ ok: true });
}
