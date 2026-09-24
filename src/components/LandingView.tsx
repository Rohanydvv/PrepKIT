"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Sparkles, ArrowRight } from "lucide-react";

interface StageData {
  num: string;
  label: string;
  title: string;
  copy: string;
  cards: { tag: string; text: string }[];
}

const STAGES: StageData[] = [
  {
    num: "01",
    label: "UNDERSTAND",
    title: "Understand the Requirements",
    copy: "Identify the requirements and responsibilities that matter most for the role, distilling long postings into clear technical and operational expectations.",
    cards: [
      { tag: "Priority Focus", text: "Core architecture & execution" },
      { tag: "Seniority Scope", text: "Team influence & autonomy" },
      { tag: "Key Competencies", text: "Primary tech stack & tools" },
    ],
  },
  {
    num: "02",
    label: "RESEARCH",
    title: "Build Company & Role Context",
    copy: "Build context around the company and its interview process. Learn recent product initiatives, engineering culture, and likely panel focus areas.",
    cards: [
      { tag: "Engineering Culture", text: "Release cadences & team norms" },
      { tag: "Product Direction", text: "Current growth & market challenges" },
      { tag: "Interview Pattern", text: "Typical stage rounds & question style" },
    ],
  },
  {
    num: "03",
    label: "PREPARE",
    title: "Turn Context Into Practice",
    copy: "Turn what matters into focused interview preparation. Practice domain-specific scenarios, refine behavioral examples, and solidify talking points.",
    cards: [
      { tag: "Technical Scenarios", text: "System tradeoffs & live prompts" },
      { tag: "Behavioral Alignment", text: "STAR framing for role impact" },
      { tag: "Reverse Questions", text: "High-leverage questions for leaders" },
    ],
  },
];

export function LandingView() {
  const { isAuthenticated } = useAuth();
  const [activeStage, setActiveStage] = useState(0);

  const currentStage = STAGES[activeStage];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 antialiased selection:bg-brand-100 selection:text-brand-800">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-brand-sm text-white font-bold text-base transition-transform group-hover:scale-[1.03]">
              <Sparkles className="w-4 h-4 fill-current text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900 tracking-tight">
              PrepKit<span className="text-brand-600">.AI</span>
            </span>
          </Link>

          {/* Center & Right Nav */}
          <div className="flex items-center gap-6">
            <a
              href="#how-it-works"
              className="hidden sm:inline-block text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              How it works
            </a>

            {isAuthenticated ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 text-sm font-semibold rounded-xl bg-brand-600 text-white hover:bg-brand-700 shadow-brand transition-all flex items-center gap-1.5 active:scale-[0.98]"
              >
                <span>Dashboard</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors px-2 py-1"
                >
                  Sign in
                </Link>
                <Link
                  href="/login?mode=signup"
                  className="px-4 py-2 text-sm font-semibold rounded-xl bg-brand-600 text-white hover:bg-brand-700 shadow-brand transition-all flex items-center gap-1.5 active:scale-[0.98]"
                >
                  <span>Get Started</span>
                  <svg
                    className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 pb-16 md:pt-20 md:pb-24 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Left: Copy & Actions */}
            <div className="lg:col-span-6 flex flex-col items-start">
              <div className="hero-animate-badge inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-brand-600 text-xs font-bold uppercase tracking-wider mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-600 animate-pulse"></span>
                PREPKIT.AI
              </div>

              <h1 className="hero-animate-title text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.1] mb-6">
                Your next interview, <br className="hidden sm:inline" />
                <span className="text-slate-900">prepared around you.</span>
              </h1>

              <p className="hero-animate-desc text-lg text-slate-600 leading-relaxed max-w-xl mb-8">
                PrepKit turns the role you&apos;re interviewing for into a focused preparation experience — helping you understand what matters, research the company, and prepare with purpose.
              </p>

              <div className="hero-animate-cta flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
                <Link
                  href="/login?mode=signup"
                  className="group px-7 py-3.5 text-base font-semibold rounded-xl bg-brand-600 text-white hover:bg-brand-700 shadow-brand transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <span>Get Started</span>
                  <svg
                    className="w-4 h-4 transition-transform group-hover:translate-x-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                </Link>
                <Link
                  href="/login"
                  className="text-sm font-semibold text-slate-600 hover:text-slate-900 text-center py-2 px-3 transition-colors"
                >
                  Already have an account?{" "}
                  <span className="text-slate-900 underline underline-offset-4 decoration-slate-300 hover:decoration-brand-600">
                    Sign in
                  </span>
                </Link>
              </div>
            </div>

            {/* Right: Interactive Product Transformation Visual */}
            <div className="lg:col-span-6 hero-animate-visual">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7 relative transition-all">
                <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Target Role Pipeline
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-600"></span> Live Model
                  </span>
                </div>

                {/* Transformation Flow */}
                <div className="space-y-4">
                  {/* Input node */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-700">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-sm font-bold">
                        JD
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">Job Description & Company URL</p>
                        <p className="text-slate-500 text-[11px]">Staff Platform Engineer · 7 days remaining</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400 px-2 py-1 bg-white rounded-md border border-slate-200">
                      Input
                    </span>
                  </div>

                  {/* Connecting line */}
                  <div className="flex justify-center">
                    <div className="w-px h-6 bg-brand-200 relative flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-brand-600"></div>
                    </div>
                  </div>

                  {/* Core Engine Node */}
                  <div className="p-4 bg-white border-2 border-brand-500/20 rounded-xl shadow-sm relative overflow-hidden flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white font-bold text-xs shadow-brand-sm">
                      PK
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">PrepKit Core Engine</span>
                        <span className="text-[11px] text-brand-600 font-semibold">Synthesis</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Aligning role responsibilities to interview domains
                      </p>
                    </div>
                  </div>

                  {/* Branching connection */}
                  <div className="flex justify-center">
                    <div className="w-px h-6 bg-brand-200 relative flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-brand-600"></div>
                    </div>
                  </div>

                  {/* Three Output Pills */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                      <div className="text-[10px] font-bold text-brand-600 uppercase mb-1">
                        01 Understand
                      </div>
                      <div className="text-xs font-bold text-slate-800">Key Criteria</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Role priorities</div>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                      <div className="text-[10px] font-bold text-brand-600 uppercase mb-1">
                        02 Research
                      </div>
                      <div className="text-xs font-bold text-slate-800">Company Context</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Stack & culture</div>
                    </div>
                    <div className="p-3 bg-slate-50 border border-brand-200 bg-brand-50/40 rounded-xl text-center">
                      <div className="text-[10px] font-bold text-brand-600 uppercase mb-1">
                        03 Prepare
                      </div>
                      <div className="text-xs font-bold text-slate-900">Targeted Prep</div>
                      <div className="text-[10px] text-brand-700 mt-0.5">Questions & schedule</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Problem: Convergence Section */}
      <section className="py-14 sm:py-20 bg-slate-100/70 border-y border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-600 mb-2.5 block">
            The Problem
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight mb-4">
            Interview preparation shouldn&apos;t start with a blank page.
          </h2>
          <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto mb-10">
            A job description tells you what a company wants. It doesn&apos;t always tell you what to study first, what the company may ask about, or how to use the time you have left.
          </p>

          {/* Convergence Diagram */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm text-left">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-6">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
                Job Description
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
                Company Info
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
                Interview Questions
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
                Time Remaining
              </div>
            </div>

            <div className="flex items-center justify-center my-3">
              <div className="flex flex-col items-center">
                <span className="text-xs font-bold text-slate-400 mb-1">converges into</span>
                <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shadow-brand-sm">
                  PK
                </div>
                <svg
                  className="w-4 h-4 text-brand-600 mt-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-brand-50 border border-brand-200 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-700 mb-0.5">
                Outcome
              </p>
              <p className="text-sm sm:text-base font-bold text-slate-900">
                One cohesive, personalized preparation path for your actual interview.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Section: Understand -> Research -> Prepare */}
      <section id="how-it-works" className="py-16 sm:py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600 mb-2 block">
              How PrepKit Works
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Three stages. Tailored to one role.
            </h2>
          </div>

          {/* Tab Buttons */}
          <div
            className="grid grid-cols-3 gap-2 sm:gap-4 p-1.5 bg-slate-100 rounded-2xl border border-slate-200 mb-8 max-w-2xl mx-auto"
            role="tablist"
            aria-label="How PrepKit Works stages"
          >
            {STAGES.map((s, idx) => {
              const isSelected = activeStage === idx;
              return (
                <button
                  key={s.num}
                  type="button"
                  role="tab"
                  id={`stage-tab-${idx}`}
                  aria-selected={isSelected}
                  aria-controls={`stage-panel-${idx}`}
                  onClick={() => setActiveStage(idx)}
                  className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm transition-all ${
                    isSelected
                      ? "text-brand-700 bg-white shadow-sm border border-slate-200/80 font-bold"
                      : "text-slate-600 hover:text-slate-900 font-semibold"
                  }`}
                >
                  <span className="text-slate-400 font-normal mr-1">{s.num}</span> {s.label}
                </button>
              );
            })}
          </div>

          {/* Stage Content Display Surface */}
          <div
            id={`stage-panel-${activeStage}`}
            role="tabpanel"
            aria-labelledby={`stage-tab-${activeStage}`}
            className="bg-slate-50 rounded-2xl border border-slate-200 p-6 sm:p-9 shadow-sm min-h-[260px] flex flex-col justify-between transition-all"
          >
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-xs font-bold uppercase tracking-wider mb-3">
                Stage {currentStage.num}
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
                {currentStage.title}
              </h3>
              <p className="text-slate-600 text-base max-w-2xl leading-relaxed mb-6">
                {currentStage.copy}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-200">
                {currentStage.cards.map((c, i) => (
                  <div key={i} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                      {c.tag}
                    </span>
                    <span className="text-xs font-semibold text-slate-800">{c.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Short Final Product Statement */}
      <section className="py-14 sm:py-16 bg-slate-50 border-t border-slate-200 text-center">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight mb-3">
            One role. One preparation path.
          </h2>
          <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl mx-auto">
            From understanding the opportunity to practicing for the conversation, PrepKit keeps your preparation focused on the interview ahead.
          </p>
        </div>
      </section>

      {/* Final CTA Section */}
      <section id="get-started" className="py-16 sm:py-20 bg-slate-100/70 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 shadow-sm">
            <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-2">
              Ready to prepare?
            </h3>
            <p className="text-slate-600 text-sm sm:text-base max-w-md mx-auto mb-7">
              Start with the role you&apos;re interviewing for.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/login?mode=signup"
                className="group px-7 py-3 text-base font-semibold rounded-xl bg-brand-600 text-white hover:bg-brand-700 shadow-brand transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <span>Get Started</span>
                <svg
                  className="w-4 h-4 transition-transform group-hover:translate-x-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </Link>
            </div>

            <div className="mt-4">
              <Link
                href="/login"
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
              >
                Already using PrepKit?{" "}
                <span className="text-slate-900 underline underline-offset-2">Sign in</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto py-8 bg-white border-t border-slate-200 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-[10px] text-white font-bold">
              PK
            </div>
            <span className="font-bold text-slate-800">
              PrepKit<span className="text-brand-600">.AI</span>
            </span>
            <span className="text-slate-400">© 2026. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="#how-it-works" className="hover:text-slate-800 transition-colors">
              How it Works
            </a>
            <span className="hover:text-slate-800 cursor-pointer transition-colors">Privacy</span>
            <span className="hover:text-slate-800 cursor-pointer transition-colors">Terms</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
