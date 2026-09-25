"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { api } from "@/lib/api";
import { ArrowRight, AlertCircle, Loader2 } from "lucide-react";

const SAMPLES = [
  {
    label: "Senior Backend Engineer (PostHog)",
    company_url: "https://posthog.com",
    days: 5,
    jd: `Senior Backend Engineer

About the Role:
We are looking for an experienced Senior Backend Engineer with 5+ years of production experience in TypeScript/Node.js or Python to help scale our core ingestion pipeline.

Requirements:
- Deep expertise in Node.js/TypeScript and distributed systems architecture (Must-have)
- Production experience with high-throughput event processing systems and Kafka (Must-have)
- Proven track record of mentoring junior engineers and leading system architecture discussions (Must-have)
- Experience designing resilient relational and columnar databases (PostgreSQL, ClickHouse) (Must-have)

Nice to have:
- Hands-on experience with Kubernetes and Terraform
- Familiarity with open-source project maintenance`,
  },
  {
    label: "Frontend Engineer (GitHub)",
    company_url: "https://github.com",
    days: 3,
    jd: `Frontend Engineer - Collaboration Tools

Must-have:
- 3+ years of intensive experience with modern React, TypeScript, and state management
- Deep understanding of Web Accessibility (a11y), browser rendering pipelines, and Core Web Vitals
- Experience writing automated unit and end-to-end integration tests

Bonus points for:
- Prior experience with design system tokens and component library authoring
- Active open source contributions`,
  },
  {
    label: "Two-Line Stub (Edge Case)",
    company_url: "https://python.org",
    days: 1,
    jd: `Junior Python Developer needed for scripting and maintenance. Must know basic Python and SQL.`,
  },
];

export default function GenerateKitPage() {
  const router = useRouter();
  const [jd, setJd] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [days, setDays] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live generation state
  const [currentStage, setCurrentStage] = useState<string>("Initializing...");
  const [progressPercent, setProgressPercent] = useState<number>(0);

  const handleSelectSample = (s: (typeof SAMPLES)[0]) => {
    setJd(s.jd);
    setCompanyUrl(s.company_url);
    setDays(s.days);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!jd.trim()) {
      setError("Please paste a job description.");
      return;
    }
    if (!companyUrl.trim()) {
      setError("Please enter the company website URL.");
      return;
    }

    setIsGenerating(true);
    setProgressPercent(10);
    setCurrentStage("Validating input and checking site security...");

    try {
      // Connect to SSE stream with credentials enabled for authentication
      const eventSource = new EventSource(
        `/api/kits/generate-stream?jd=${encodeURIComponent(jd)}&company_url=${encodeURIComponent(companyUrl)}&days=${days}`,
        { withCredentials: true }
      );
      let receivedAnyProgress = false;

      eventSource.addEventListener("progress", (e) => {
        receivedAnyProgress = true;
        const data = JSON.parse(e.data);
        setCurrentStage(data.message);
        setProgressPercent(data.percent);
      });

      eventSource.addEventListener("completed", (e) => {
        const data = JSON.parse(e.data);
        eventSource.close();
        router.push(`/kit/${data.record.id}`);
      });

      eventSource.addEventListener("error", async (e) => {
        eventSource.close();

        // If SSE fails before sending progress, seamlessly fall back to standard POST
        if (!receivedAnyProgress) {
          setCurrentStage("Running research and generation engine...");
          setProgressPercent(40);
          try {
            const res = await api.kits.generate(jd, companyUrl, days);
            router.push(`/kit/${res.record.id}`);
            return;
          } catch (postErr: any) {
            if (postErr?.status === 401) {
              router.push("/login");
              return;
            }
            setError((postErr as Error).message);
            setIsGenerating(false);
            return;
          }
        }

        let errMsg = "An error occurred during kit generation.";
        try {
          const data = JSON.parse((e as MessageEvent).data);
          if (data.message) errMsg = data.message;
        } catch {
          // ignore
        }
        setError(errMsg);
        setIsGenerating(false);
      });
    } catch {
      // Fallback to standard POST
      try {
        const res = await api.kits.generate(jd, companyUrl, days);
        router.push(`/kit/${res.record.id}`);
      } catch (err: any) {
        if (err?.status === 401) {
          router.push("/login");
          return;
        }
        setError((err as Error).message);
        setIsGenerating(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Create interview kit
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Generate a personalized preparation plan from a job description.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="mb-5 p-3.5 rounded-xl bg-rose-50/80 border border-rose-200/70 text-rose-900 text-xs flex items-start space-x-2.5"
          >
            <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
            <p className="font-medium text-rose-900 leading-relaxed">{error}</p>
          </div>
        )}

        {isGenerating ? (
          /* Polished Generation Progress */
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 sm:p-12 text-center space-y-4">
            <Loader2 className="h-7 w-7 text-brand-600 animate-spin mx-auto" />
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Generating your prep kit
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {currentStage}
              </p>
            </div>

            {/* Progress bar */}
            <div className="pt-2 max-w-sm mx-auto">
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-brand-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-400 font-mono mt-1.5 block">
                {progressPercent}%
              </span>
            </div>
          </div>
        ) : (
          /* Form Card */
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8 lg:p-10 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Job Description Field */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label
                    htmlFor="jd"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Job description
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {jd.length} chars
                  </span>
                </div>
                <textarea
                  id="jd"
                  name="jd"
                  required
                  rows={8}
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  placeholder="Paste the full job description text here..."
                  className="w-full text-sm p-3.5 rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-sans leading-relaxed transition hover:border-slate-300 resize-y"
                />
              </div>

              {/* Company Website & Days (Two balanced columns) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="companyUrl"
                    className="block text-xs font-semibold text-slate-700 mb-2"
                  >
                    Company website
                  </label>
                  <input
                    id="companyUrl"
                    name="companyUrl"
                    type="text"
                    required
                    value={companyUrl}
                    onChange={(e) => setCompanyUrl(e.target.value)}
                    placeholder="https://company.com"
                    className="h-11 w-full px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition"
                  />
                </div>

                <div>
                  <label
                    htmlFor="days"
                    className="block text-xs font-semibold text-slate-700 mb-2"
                  >
                    Days to prepare
                  </label>
                  <div className="h-11 flex items-center space-x-3 px-3.5 rounded-xl border border-slate-200 bg-white">
                    <input
                      id="days"
                      type="range"
                      min={1}
                      max={60}
                      value={days}
                      onChange={(e) => setDays(parseInt(e.target.value, 10))}
                      className="flex-1 accent-brand-600 cursor-pointer"
                    />
                    <span className="font-semibold text-xs text-brand-700 bg-brand-50 px-2.5 py-1 rounded-lg border border-brand-100 min-w-[40px] text-center">
                      {days}d
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Test Samples (Unobtrusive & Visually Secondary) */}
              <div className="pt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-slate-400 text-[11px] mr-1">Quick samples:</span>
                {SAMPLES.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    onClick={() => handleSelectSample(sample)}
                    className="text-[11px] text-slate-600 hover:text-brand-600 hover:bg-slate-50 px-2 py-1 rounded-md border border-slate-200/80 transition-colors"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>

              {/* Submit Action (Aligned bottom-right) */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="w-full sm:w-auto px-6 py-2.5 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-sm hover:shadow-brand-sm transition-all duration-150 inline-flex items-center justify-center space-x-2"
                >
                  <span>Generate Kit</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
