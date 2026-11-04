"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ServiceError } from "@/services/types";

const FALLBACK = "Something went wrong. Try again.";

/** Loads through a service on mount, and runs changes that reload the data afterwards. */
export function useData<T>(load: () => Promise<T>) {
  const loader = useRef(load);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await loader.current());
    } catch (err) {
      setError(err instanceof ServiceError ? err.message : FALLBACK);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      setError(null);
      try {
        await action();
        await reload();
        return true;
      } catch (err) {
        setError(err instanceof ServiceError ? err.message : FALLBACK);
        return false;
      }
    },
    [reload],
  );

  return { data, error, reload, run };
}
