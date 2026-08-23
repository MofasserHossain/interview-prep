import { HomeAction, NotFoundIcon, SystemState } from "@/components/system-state";

export default function NotFound() {
  return (
    <SystemState
      action={<HomeAction />}
      description="The page you opened does not exist in this interview prep workspace."
      icon={<NotFoundIcon />}
      kicker="404"
      title="Page not found"
    />
  );
}
