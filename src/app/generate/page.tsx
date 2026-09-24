"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { api } from "@/lib/api";
import {
  Sparkles,
  Globe,
  FileText,
  Calendar,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";

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
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Generate Interview Preparation Kit
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Provide the job description and company site. Our research engine crawls their pages, extracts requirements, identifies coverage gaps, and crafts a day-by-day plan.
          </p>
        </div>

        {/* Preset Sample Quick-Loads */}
        <div className="mb-6 bg-slate-100/70 p-3.5 rounded-xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center space-x-1.5">
            <Sparkles className="h-3.5 w-3.5 text-brand-600" />
            <span>Load Quick Test Samples:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {SAMPLES.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => handleSelectSample(sample)}
                className="text-xs bg-white hover:bg-slate-50 text-slate-700 font-medium px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs transition"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Generation Error</div>
              <div className="text-xs mt-0.5 text-rose-700">{error}</div>
            </div>
          </div>
        )}

        {isGenerating ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center my-8">
            <div className="inline-flex h-16 w-16 bg-brand-50 text-brand-600 rounded-full items-center justify-center mb-5 animate-pulse">
              <RefreshCw className="h-8 w-8 animate-spin text-brand-600" />
            </div>

            <h2 className="text-xl font-bold text-slate-900">
              Generating Your Prep Kit...
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Please wait while we crawl the company domain, research hiring debriefs, and verify requirement coverage.
            </p>

            {/* Progress Bar */}
            <div className="mt-8 max-w-md mx-auto">
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-2">
                <span>{currentStage}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-brand-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Deliberate Steps Overview */}
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 text-left max-w-xl mx-auto text-xs text-slate-600">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <div className="font-semibold text-slate-800">1. Web Crawler</div>
                <div className="text-[11px] text-slate-400">Ranks hiring & about links</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <div className="font-semibold text-slate-800">2. Extraction</div>
                <div className="text-[11px] text-slate-400">Must vs Nice requirements</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <div className="font-semibold text-slate-800">3. Pass 2 Loop</div>
                <div className="text-[11px] text-slate-400">Closes coverage gaps</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <div className="font-semibold text-slate-800">4. Arithmetic</div>
                <div className="text-[11px] text-slate-400">Strict day allocation</div>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-6">
            {/* Job Description Textarea */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-semibold text-slate-900 flex items-center space-x-1.5">
                  <FileText className="h-4 w-4 text-brand-600" />
                  <span>Job Description Text</span>
                </label>
                <span className="text-xs text-slate-400 font-mono">
                  {jd.length} characters
                </span>
              </div>
              <textarea
                required
                rows={10}
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                placeholder="Paste the full job description text here (responsibilities, required skills, preferred qualifications)..."
                className="w-full text-sm p-4 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-sans leading-relaxed transition"
              />
              <p className="text-xs text-slate-400 mt-1.5">
                Note: Thin descriptions (e.g. 2-line stubs) are handled truthfully without fabricating phantom requirements.
              </p>
            </div>

            {/* Company Website & Days Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2 flex items-center space-x-1.5">
                  <Globe className="h-4 w-4 text-brand-600" />
                  <span>Company Website Address</span>
                </label>
                <input
                  type="text"
                  required
                  value={companyUrl}
                  onChange={(e) => setCompanyUrl(e.target.value)}
                  placeholder="https://company.com or http://localhost:8099/..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition"
                />
                <p className="text-xs text-slate-400 mt-1.5">
                  Crawl engine discovers career handbooks and engineering blogs.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2 flex items-center space-x-1.5">
                  <Calendar className="h-4 w-4 text-brand-600" />
                  <span>Days Available Before Interview</span>
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="range"
                    min={1}
                    max={60}
                    value={days}
                    onChange={(e) => setDays(parseInt(e.target.value, 10))}
                    className="flex-1 accent-brand-600 cursor-pointer"
                  />
                  <span className="font-bold text-base text-brand-700 bg-brand-50 px-3 py-1 rounded-lg border border-brand-200 min-w-[55px] text-center">
                    {days}d
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Arithmetic allocation spreads topics across exactly {days} day(s).
                </p>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div className="text-xs text-slate-400 flex items-center space-x-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>SSRF Protection & Untrusted Input Isolation Active</span>
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-brand-600/20 transition flex items-center space-x-2"
              >
                <Sparkles className="h-4 w-4" />
                <span>Start Research & Generate Kit</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
