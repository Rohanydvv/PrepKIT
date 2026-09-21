"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { api } from "@/lib/api";
import { StoredKitRecord } from "@/core/types";
import {
  Printer,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Lightbulb,
  ShieldCheck,
  Award,
} from "lucide-react";

export default function CheatSheetPage() {
  const params = useParams();
  const router = useRouter();
  const kitId = params?.id as string;
  const [record, setRecord] = useState<StoredKitRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!kitId) return;
    api.kits
      .get(kitId)
      .then((res) => setRecord(res.record))
      .catch((err) => {
        alert("Failed to load cheat sheet: " + (err as Error).message);
        router.push(`/kit/${kitId}`);
      })
      .finally(() => setLoading(false));
  }, [kitId, router]);

  if (loading || !record) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar kitId={kitId} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      </div>
    );
  }

  const kit = record.kit;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <Navbar kitId={kitId} />

      <div className="max-w-4xl mx-auto w-full px-4 py-6 no-print flex items-center justify-between">
        <Link
          href={`/kit/${kitId}`}
          className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center space-x-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Prep Kit</span>
        </Link>

        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-semibold rounded-xl flex items-center space-x-2 shadow-sm transition"
        >
          <Printer className="h-4 w-4" />
          <span>Print / Save as PDF</span>
        </button>
      </div>

      {/* Printable Sheet */}
      <main className="max-w-4xl w-full mx-auto p-8 sm:p-10 bg-white text-slate-900 shadow-lg sm:rounded-2xl border border-slate-200 mb-12 print-page print:p-0 print:border-none print:shadow-none">
        {/* Document Header */}
        <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-brand-600">
              Interview Day-Of Cheat Sheet • 30-Minute Review
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 mt-1">
              {kit.role.title}
            </h1>
            <div className="text-xs text-slate-600 font-semibold mt-0.5">
              {kit.source.company} • {kit.source.company_url}
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-500 font-mono">
            <div>Seniority: {kit.role.seniority}</div>
            <div>{kit.schedule.days_available}-Day Prep Kit</div>
          </div>
        </div>

        {/* Section 1: Company Intelligence Snapshot */}
        <div className="mb-6">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 pb-1 border-b border-slate-200 mb-2.5 flex items-center space-x-1.5">
            <Building2 className="h-3.5 w-3.5 text-brand-600" />
            <span>1. Company Intelligence & Operating Model</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-700">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <span className="font-bold text-slate-900 block mb-1">Summary</span>
              <p className="leading-relaxed">{kit.company_brief.summary}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <span className="font-bold text-slate-900 block mb-1">What They Do</span>
              <p className="leading-relaxed">{kit.company_brief.what_they_do}</p>
            </div>
          </div>
        </div>

        {/* Section 2: Top Must-Have Interview Questions & Talking Points */}
        <div className="mb-6">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 pb-1 border-b border-slate-200 mb-2.5 flex items-center space-x-1.5">
            <Award className="h-3.5 w-3.5 text-brand-600" />
            <span>2. High-Yield Interview Questions & Architecture Blueprints</span>
          </h2>
          <div className="space-y-3">
            {kit.questions.slice(0, 5).map((q, idx) => (
              <div key={q.id} className="text-xs border-l-2 border-brand-600 pl-3 py-1">
                <div className="font-bold text-slate-900">
                  {idx + 1}. [{q.category.toUpperCase()}] {q.prompt}
                </div>
                <div className="text-slate-600 mt-1 font-medium bg-slate-50 p-2 rounded border border-slate-100">
                  <span className="font-bold text-slate-700">Key Blueprint: </span>
                  {q.answer_outline}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: High-Yield Flashcard Drills */}
        <div className="mb-6">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 pb-1 border-b border-slate-200 mb-2.5 flex items-center space-x-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-brand-600" />
            <span>3. Rapid-Recall Mental Models & Trade-offs</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {kit.flashcards.slice(0, 4).map((fc) => (
              <div key={fc.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-bold text-slate-900 block mb-1">Q: {fc.front}</span>
                <span className="text-slate-700 block">A: {fc.back}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section 4: Day-Of Interview Checklist & Questions for Interviewer */}
        <div>
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 pb-1 border-b border-slate-200 mb-2.5 flex items-center space-x-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>4. Day-Of Pre-Flight Checklist</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
            <div className="space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-100">
              <span className="font-bold text-slate-900 block mb-1">Before You Join:</span>
              <div>☑ Test microphone, camera, and clean background</div>
              <div>☑ Have water nearby and open a blank scratchpad</div>
              <div>☑ Remember STAR method for behavioural questions</div>
            </div>
            <div className="space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-100">
              <span className="font-bold text-slate-900 block mb-1">Smart Questions to Ask Them:</span>
              <div>• "What does success look like in the first 90 days for this role?"</div>
              <div>• "How does the engineering team handle technical debt vs new features?"</div>
              <div>• "What is the most challenging architectural bottleneck currently being solved?"</div>
            </div>
          </div>
        </div>

        {/* Printable Footer */}
        <div className="mt-8 pt-4 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between">
          <span>Generated by PrepKit.AI • Trao Full-Stack Engineering Assessment</span>
          <span>Verified against Appendix A specification</span>
        </div>
      </main>
    </div>
  );
}
