import {
  BotMessageSquare,
  BrainCircuit,
  Braces,
  Blocks,
  CodeXml,
  Component,
  Container,
  FileText,
  Layers3,
  Library,
  Router,
  Server,
  Smartphone,
  Terminal,
  Workflow,
  Zap,
} from "lucide-react";

const trackIcons = {
  all: Library,
  "role-prep": FileText,
  backend: Server,
  nodejs: Terminal,
  javascript: Braces,
  react: Component,
  "ai-engineering": BrainCircuit,
  "system-design": Workflow,
  devops: Container,
  dotnet: Blocks,
  python: Terminal,
  mobile: Smartphone,
  "frontend-architecture": Layers3,
};

const topicIcons = {
  "senior-full-stack-saas-job-prep": FileText,
  backend: Server,
  "senior-api-database-performance": Zap,
  "nodejs-backend": Terminal,
  "nodejs-event-loop-runtime": Router,
  javascript: Braces,
  "javascript-modules-import-export": CodeXml,
  "javascript-promises-async": Workflow,
  "javascript-event-loop-runtime": Router,
  "javascript-this-functions": Braces,
  "javascript-prototypes-objects": Blocks,
  "javascript-collections-iteration": Library,
  "javascript-loops-array-methods": Workflow,
  "javascript-scope-hoisting-closures": Layers3,
  "javascript-types-equality-copying": CodeXml,
  "frontend-react-next": Component,
  "typescript-react-architecture": Braces,
  "react-performance": Zap,
  "react-core-through-17": Component,
  "react-18-features": Workflow,
  "react-19-features": Component,
  "react-compiler": Zap,
  "senior-frontend-react-scenarios": Workflow,
  "machine-coding": CodeXml,
  "ai-frontend-engineering": BotMessageSquare,
  "system-design-microservices": Workflow,
  "kafka-event-streaming": Workflow,
  "rabbitmq-message-broker": Workflow,
  "mqtt-iot-messaging": Router,
  "design-patterns": Blocks,
  "devops-docker-kubernetes": Container,
  "aws-saas-observability": Workflow,
  "nginx-web-infrastructure": Router,
  "dotnet-csharp": Blocks,
  "python-backend-frameworks": Terminal,
  "mobile-react-native": Smartphone,
  "frontend-architecture-micro-frontends": Layers3,
};

export function TrackIcon({ slug }: { slug: string }) {
  const Icon = trackIcons[slug as keyof typeof trackIcons] ?? Library;

  return (
    <span className="topic-icon">
      <Icon size={18} />
    </span>
  );
}

export function TopicIcon({
  className,
  size = 17,
  slug,
}: {
  className?: string;
  size?: number;
  slug: string;
}) {
  const Icon = topicIcons[slug as keyof typeof topicIcons] ?? Library;

  return (
    <span className={className ? `topic-icon ${className}` : "topic-icon"}>
      <Icon size={size} />
    </span>
  );
}
