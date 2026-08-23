import { notFound } from "next/navigation";
import { InterviewApp } from "@/components/interview-app";
import { getInterviewData } from "@/lib/content";

export const dynamic = "force-static";

export default function Home() {
  const data = getInterviewData();

  if (!data.questions.length) {
    notFound();
  }

  return <InterviewApp initialData={data} />;
}
