"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveScope } from "@/lib/demo-cloud/browser";

export type LiveState = "live" | "polling" | "offline";

const POLL_MS = 5000;
const LIVE_SAFETY_REFRESH_MS = 15000;

/** Realtime when it's working, and a 5 second poll when it isn't. `refresh` runs on every change.
 *  While live, a slow refresh also runs, so a missed event can't hide an order for long. */
export function useRealtime(scope: LiveScope | null, refresh: () => void): LiveState {
  const [state, setState] = useState<LiveState>("polling");
  const latest = useRef(refresh);
  latest.current = refresh;
  const key = scope ? JSON.stringify(scope) : null;

  useEffect(() => {
    if (!key) return;
    const parsed = JSON.parse(key) as LiveScope;
    let stopped = false;
    let subscribed = false;
    let unsubscribe = () => {};
    let timer: number | undefined;

    const run = () => latest.current();
    const safety = window.setInterval(() => {
      if (subscribed) run();
    }, LIVE_SAFETY_REFRESH_MS);

    async function poll() {
      const { probe } = await import("@/lib/demo-cloud/browser");
      const reachable = await probe();
      if (stopped || subscribed) return;
      setState(reachable ? "polling" : "offline");
      if (reachable) run();
      timer = window.setTimeout(() => void poll(), POLL_MS);
    }

    void import("@/lib/demo-cloud/browser")
      .then(({ subscribe }) =>
        subscribe(parsed, run, (isSubscribed) => {
          if (stopped) return;
          const changed = subscribed !== isSubscribed;
          subscribed = isSubscribed;
          if (!changed) return;
          if (isSubscribed) {
            window.clearTimeout(timer);
            setState("live");
            run(); // catch up on anything missed while not subscribed
          } else {
            void poll();
          }
        }),
      )
      .then((stop) => {
        if (stopped) stop();
        else unsubscribe = stop;
      });
    void poll();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearInterval(safety);
      unsubscribe();
    };
  }, [key]);

  return state;
}
