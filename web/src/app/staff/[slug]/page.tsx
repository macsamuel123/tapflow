"use client";

import { useParams } from "next/navigation";
import { StaffModeScreen } from "@/components/staff/StaffModeScreen";

export default function StaffModePage() {
  const { slug } = useParams<{ slug: string }>();
  return <StaffModeScreen key={slug} slug={slug} />;
}
