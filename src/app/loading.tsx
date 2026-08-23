import { LoadingIcon, SystemState } from "@/components/system-state";

export default function Loading() {
  return (
    <SystemState
      description="Preparing the question bank and study workspace."
      icon={<LoadingIcon />}
      kicker="Loading"
      title="Loading interview prep"
    />
  );
}
