import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, BookOpen, Home, RefreshCcw, SearchX } from "lucide-react";

type SystemStateProps = {
  action?: ReactNode;
  description: string;
  icon?: ReactNode;
  kicker?: string;
  title: string;
};

export function SystemState({ action, description, icon, kicker, title }: SystemStateProps) {
  return (
    <main className="system-state-shell">
      <section className="system-state-card">
        <div className="system-state-icon" aria-hidden="true">
          {icon ?? <AlertTriangle size={24} />}
        </div>
        {kicker ? <p className="eyebrow">{kicker}</p> : null}
        <h1>{title}</h1>
        <p>{description}</p>
        {action ? <div className="system-state-actions">{action}</div> : null}
      </section>
    </main>
  );
}

export function HomeAction() {
  return (
    <Link className="state-primary-action" href="/">
      <Home size={16} />
      Docs Library
    </Link>
  );
}

export function RetryAction({ onRetry }: { onRetry: () => void }) {
  return (
    <button className="state-primary-action" onClick={onRetry} type="button">
      <RefreshCcw size={16} />
      Try Again
    </button>
  );
}

export function NotFoundIcon() {
  return <SearchX size={24} />;
}

export function LoadingIcon() {
  return <BookOpen size={24} />;
}
