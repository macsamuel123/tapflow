"use client";

import { useEffect, useRef } from "react";

const POLL_MS = 2000;

/** Reruns `refresh` when another tab changes the demo, and on a timer as a fallback. Same
 *  browser only: tracking across devices waits for the real backend. */
export function useLive(refresh: () => void): void {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    const run = () => latest.current();
    window.addEventListener("storage", run);
    const timer = window.setInterval(run, POLL_MS);
    return () => {
      window.removeEventListener("storage", run);
      window.clearInterval(timer);
    };
  }, []);
}
