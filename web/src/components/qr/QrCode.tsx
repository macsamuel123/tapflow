"use client";

import { useMemo } from "react";
import { qrMatrix } from "@/lib/qr/matrix";

const QUIET_ZONE = 4;

export function QrCode({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const matrix = qrMatrix(value);
    let d = "";
    for (let y = 0; y < matrix.size; y += 1) {
      for (let x = 0; x < matrix.size; x += 1) {
        if (matrix.isDark(x, y)) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { size: matrix.size + QUIET_ZONE * 2, path: d };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      data-testid="qr-code"
      data-url={value}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={`bg-white ${className}`}
    >
      <path d={path} fill="#000" />
    </svg>
  );
}
