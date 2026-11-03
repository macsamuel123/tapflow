import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { MenuScreen } from "@/components/menu/MenuScreen";
import { ApiError, getMenu } from "@/lib/api-client";
import type { Menu } from "@/lib/api-types";

// Table QR landing page: /r/{slug}/t/{tableId}?token=...
// The menu is server-rendered (fast first paint, no client fetch). The session and cart are
// client-side: the API decides from the signed token whether this diner may check out.

type Params = { slug: string; tableId: string };
type Search = { token?: string | string[] };

export const dynamic = "force-dynamic"; // stock (86) changes must show on every load

// One API call per request, shared by generateMetadata and the page.
const fetchMenu = cache((slug: string): Promise<Menu> => getMenu(slug));

async function loadMenu(slug: string): Promise<Menu> {
  try {
    return await fetchMenu(slug);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 422)) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    return { title: (await fetchMenu(slug)).restaurant.name };
  } catch {
    return { title: "Menu" };
  }
}

export default async function TablePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { slug, tableId } = await params;
  const { token } = await searchParams;
  const menu = await loadMenu(slug);
  const qrToken = typeof token === "string" && token.length > 0 ? token : null;

  return <MenuScreen menu={menu} slug={slug} tableId={tableId} qrToken={qrToken} />;
}
