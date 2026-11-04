"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { GuestOrderStatus } from "@/components/guest/GuestOrderStatus";

function Status() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const params = useSearchParams();
  const touchpoint = params.get("tp");
  const menuHref = touchpoint
    ? `/demo/v/${slug}/p/${touchpoint}?token=${encodeURIComponent(params.get("token") ?? "")}`
    : null;
  return <GuestOrderStatus slug={slug} orderId={orderId} menuHref={menuHref} />;
}

export default function DemoOrderPage() {
  return (
    <Suspense>
      <Status />
    </Suspense>
  );
}
