"use client";

import { useEffect } from "react";
import "./globals.css";
import { RetryAction, SystemState } from "@/components/system-state";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <SystemState
          action={<RetryAction onRetry={retry} />}
          description="The app shell failed before the normal layout could render."
          kicker={error.digest ? `Error ${error.digest}` : "Application Error"}
          title="Interview Prep is unavailable"
        />
      </body>
    </html>
  );
}
