"use client";

import { useEffect } from "react";
import { RetryAction, SystemState } from "@/components/system-state";

export default function Error({
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
    <SystemState
      action={<RetryAction onRetry={retry} />}
      description="Something interrupted the question bank. Try again to re-render this route."
      kicker={error.digest ? `Error ${error.digest}` : "Error"}
      title="Unable to load this view"
    />
  );
}
