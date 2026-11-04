"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { GuestMenuScreen } from "@/components/guest/GuestMenuScreen";

function Guest() {
  const { slug, touchpointId } = useParams<{ slug: string; touchpointId: string }>();
  const token = useSearchParams().get("token");
  const context = useMemo(() => ({ slug, touchpointId, token }), [slug, touchpointId, token]);
  return <GuestMenuScreen key={`${slug}/${touchpointId}/${token}`} context={context} />;
}

export default function DemoGuestPage() {
  return (
    <Suspense>
      <Guest />
    </Suspense>
  );
}
