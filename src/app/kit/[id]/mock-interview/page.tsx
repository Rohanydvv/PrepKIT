"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { api } from "@/lib/api";
import { StoredKitRecord, Question } from "@/core/types";
import {
  Award,
  Mic,
  MicOff,
  ArrowLeft,
  Sparkles,
  Send,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/**
 * Parses a continuous model answer string into structured blueprint sections (01, 02, 03).
 */
function parseModelAnswerSections(text: string) {
  if (!text) return [];

  // Check if text already contains double-newline paragraphs
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const defaultTitles = [
    "High-Level Architecture & Strategy",
    "Technical Implementation & Concrete Details",
    "Trade-offs, Failure Modes & Operational Metrics",
    "STAR Resolution & Key Takeaways",
  ];

  if (paragraphs.length >= 2) {
    return paragraphs.map((content, idx) => ({
      step: `0${idx + 1}`,
      title: defaultTitles[idx] || `Stage 0${idx + 1}`,
      content,
    }));
  }

  // Fallback: split by sentences into 2 or 3 balanced stages
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) || [text];
  if (sentences.length >= 4) {
    const p1End = Math.ceil(sentences.length / 3);
    const p2End = Math.ceil((sentences.length * 2) / 3);

    const chunk1 = sentences.slice(0, p1End).join("").trim();
    const chunk2 = sentences.slice(p1End, p2End).join("").trim();
    const chunk3 = sentences.slice(p2End).join("").trim();

    return [
      { step: "01", title: "High-Level Architecture & Strategy", content: chunk1 },
      { step: "02", title: "Technical Implementation & Concrete Details", content: chunk2 },
      { step: "03", title: "Trade-offs, Failure Modes & Operational Metrics", content: chunk3 },
    ];
  }

  return [{ step: "01", title: "Exemplary Candidate Response", content: text }];
}

export default function MockInterviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const kitId = params?.id as string;
  const initialQId = searchParams.get("q");

  const [record, setRecord] = useState<StoredKitRecord | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [candidateAnswer, setCandidateAnswer] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [blueprintExpanded, setBlueprintExpanded] = useState(true);
  const [expandedBlueprintStages, setExpandedBlueprintStages] = useState<Set<number>>(new Set([0]));
  const [showAllStrengths, setShowAllStrengths] = useState(false);
  const [showAllImprovements, setShowAllImprovements] = useState(false);
  const [showCriteria, setShowCriteria] = useState(false);
  const [evaluation, setEvaluation] = useState<{
    score: number;
    rubricScores: { depth: number; structure: number; alignment: number; clarity: number };
    strengths: string[];
    improvements: string[];
    modelAnswer: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!kitId) return;
    api.kits
      .get(kitId)
      .then((res) => {
        setRecord(res.record);
        if (initialQId) {
          const match = res.record.kit.questions.find((q) => q.id === initialQId);
          if (match) setSelectedQuestion(match);
        } else if (res.record.kit.questions.length > 0) {
          setSelectedQuestion(res.record.kit.questions[0]);
        }
      })
      .catch((err) => {
        if (err?.status === 401) {
          router.push("/login");
          return;
        }
        alert("Failed to load mock interview: " + (err as Error).message);
        router.push(`/kit/${kitId}`);
      })
      .finally(() => setLoading(false));
  }, [kitId, initialQId, router]);

  // Voice dictation using Web Speech API
  const handleToggleVoice = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      alert("Voice speech recognition is not supported in this browser. You can type your answer.");
      return;
    }

    if (isRecording) {
      setIsRecording(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);

    recognition.onresult = (event: any) => {
      let current = "";
      for (let i = 0; i < event.results.length; i++) {
        current += event.results[i][0].transcript + " ";
      }
      setCandidateAnswer((prev) => (prev ? `${prev} ${current}` : current));
    };

    recognition.start();
  };

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuestion || !candidateAnswer.trim()) return;

    setIsEvaluating(true);
    try {
      const res = await api.mockInterview.evaluate(
        selectedQuestion.prompt,
        selectedQuestion.category,
        selectedQuestion.answer_outline,
        candidateAnswer
      );
      setEvaluation(res.evaluation);
      setShowAllStrengths(false);
      setShowAllImprovements(false);
      setExpandedBlueprintStages(new Set([0]));
    } catch (err) {
      alert("Evaluation failed: " + (err as Error).message);
    } finally {
      setIsEvaluating(false);
    }
  };

  const toggleBlueprintStage = (idx: number) => {
    setExpandedBlueprintStages((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (loading || !record) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Navbar kitId={kitId} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-sm w-full mx-4">
            <RefreshCw className="h-8 w-8 animate-spin text-brand-600 mx-auto" />
            <h3 className="text-base font-bold text-slate-900 mt-4">Loading Mock Coach...</h3>
            <p className="text-xs text-slate-500 mt-1">
              Preparing question rubric and AI assessment models.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const kit = record.kit;
  const wordCount = candidateAnswer.trim() ? candidateAnswer.trim().split(/\s+/).length : 0;
  const modelAnswerSections = evaluation ? parseModelAnswerSections(evaluation.modelAnswer) : [];

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-slate-50 lg:overflow-hidden">
      <Navbar kitId={kitId} />

      <div className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:overflow-hidden flex flex-col">
        {/* Navigation & Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 shrink-0">
          <div className="flex items-center space-x-3">
            <Link
              href={`/kit/${kitId}`}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center space-x-1.5 bg-white border border-slate-200/80 px-3 py-1.5 rounded-xl shadow-2xs transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Workspace</span>
            </Link>

            <span className="text-xs text-slate-400">•</span>

            <span className="text-xs font-semibold text-slate-700 truncate max-w-md">
              {kit.role.title} ({kit.source.company || "Company"})
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider bg-amber-50 text-amber-800 px-3 py-1 rounded-full border border-amber-200/80 flex items-center space-x-1.5">
              <Award className="h-3.5 w-3.5 text-amber-600" />
              <span>4-Point AI Mock Coach</span>
            </span>
          </div>
        </div>

        {/* 2-Column Wide Workspace Layout with independent scroll containers on desktop */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)] xl:grid-cols-[440px_minmax(0,1fr)] gap-6 lg:gap-8 items-start lg:overflow-hidden">
          {/* ======================================================== */}
          {/* LEFT COLUMN: INTERVIEW CONTEXT & ACTIVE QUESTION        */}
          {/* ======================================================== */}
          <div className="lg:h-full lg:overflow-y-auto space-y-4 pr-1 scrollbar-thin">
            {/* Question Selector Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Rehearse Question ({kit.questions.length} Available)
              </label>
              <select
                value={selectedQuestion?.id || ""}
                onChange={(e) => {
                  const match = kit.questions.find((q) => q.id === e.target.value);
                  if (match) {
                    setSelectedQuestion(match);
                    setCandidateAnswer("");
                    setEvaluation(null);
                    setShowAllStrengths(false);
                    setShowAllImprovements(false);
                    setExpandedBlueprintStages(new Set([0]));
                  }
                }}
                className="w-full text-xs font-semibold p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition"
              >
                {kit.questions.map((q) => (
                  <option key={q.id} value={q.id}>
                    [{q.category.toUpperCase()}] {q.id}: {q.prompt.slice(0, 48)}...
                  </option>
                ))}
              </select>
            </div>

            {/* Active Question Prompt Card */}
            {selectedQuestion && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md border border-slate-200/60">
                      {selectedQuestion.id.toUpperCase()}
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-brand-700 bg-brand-50 px-2.5 py-0.5 rounded-md border border-brand-200/60">
                      {selectedQuestion.category.replace("-", " ")}
                    </span>
                  </div>

                  <span className="text-xs font-semibold text-slate-400">
                    <span className="text-amber-500 font-bold">
                      {"★".repeat(selectedQuestion.difficulty)}
                    </span>
                    <span className="text-slate-200">
                      {"★".repeat(3 - selectedQuestion.difficulty)}
                    </span>
                  </span>
                </div>

                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Interviewer Question
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 leading-snug tracking-tight">
                    {selectedQuestion.prompt}
                  </h2>
                </div>

                {/* Expected Talking Points Box with Progressive Disclosure */}
                <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/60 text-xs text-slate-700 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-slate-800 flex items-center space-x-1.5">
                      <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                      <span>Expected Talking Points & Criteria:</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCriteria(!showCriteria)}
                      className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 transition"
                    >
                      {showCriteria ? "Compact" : "View full outline"}
                    </button>
                  </div>
                  <p
                    className={`leading-relaxed text-slate-600 transition-all ${
                      showCriteria ? "" : "line-clamp-3"
                    }`}
                  >
                    {selectedQuestion.answer_outline}
                  </p>
                </div>

                {/* Strategy Prompt Guidance */}
                <div className="pt-1 text-[11px] text-slate-400 flex items-center space-x-1.5">
                  <Sparkles className="h-3 w-3 text-brand-500 shrink-0" />
                  <span>
                    {selectedQuestion.category === "behavioural"
                      ? "Formulate with STAR: Situation, Task, Action taken, Result."
                      : "Lead with architecture trade-offs, scalability, and concrete failure modes."}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ======================================================== */}
          {/* RIGHT COLUMN: CANDIDATE ANSWER & AI EVALUATION          */}
          {/* ======================================================== */}
          <div className="lg:h-full lg:overflow-y-auto scroll-smooth pr-1 space-y-5 min-w-0">
            {/* Candidate Answer Box */}
            <form
              onSubmit={handleEvaluate}
              className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Your Response</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Speak aloud or type your complete answer before submitting.
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="text-xs font-semibold text-slate-400">
                    {wordCount} words
                  </span>

                  <button
                    type="button"
                    onClick={handleToggleVoice}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
                      isRecording
                        ? "bg-rose-600 text-white animate-pulse"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                    }`}
                  >
                    {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                    <span>{isRecording ? "Listening..." : "Dictate Out Loud"}</span>
                  </button>
                </div>
              </div>

              <textarea
                required
                rows={7}
                value={candidateAnswer}
                onChange={(e) => setCandidateAnswer(e.target.value)}
                placeholder="Structure your response: state the core design choice, explain your reasoning, reference real metrics or edge cases, and describe the measurable outcome..."
                className="w-full text-sm p-4 rounded-xl border border-slate-200 text-slate-900 bg-slate-50/30 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-sans leading-relaxed transition"
              />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <span className="text-[11px] text-slate-400">
                  Evaluated across Technical Depth, STAR Structure, Company Alignment & Clarity.
                </span>

                <button
                  type="submit"
                  disabled={isEvaluating || !candidateAnswer.trim()}
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm shadow-brand-600/20 transition flex items-center justify-center space-x-2 shrink-0"
                >
                  {isEvaluating ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Evaluating 4-Point Rubric...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>Submit for 4-Point Feedback</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* AI Evaluation Results */}
            {evaluation && (
              <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200/80 shadow-2xs space-y-6 animate-in fade-in duration-300">
                {/* Score Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <div>
                    <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400">
                      Overall Assessment Score
                    </span>
                    <div className="flex items-baseline space-x-2 mt-0.5">
                      <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                        {evaluation.score}
                      </span>
                      <span className="text-base font-bold text-slate-400">/ 100</span>
                    </div>
                  </div>

                  <div className="sm:text-right">
                    <span
                      className={`inline-block text-xs font-extrabold uppercase tracking-wider px-3.5 py-1.5 rounded-full border ${
                        evaluation.score >= 80
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : evaluation.score >= 60
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-rose-50 text-rose-800 border-rose-200"
                      }`}
                    >
                      {evaluation.score >= 80
                        ? "Strong Hire"
                        : evaluation.score >= 60
                        ? "Leaning Hire"
                        : "Needs Review"}
                    </span>
                  </div>
                </div>

                {/* 4-Point Rubric Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70 text-center">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Technical Depth
                    </div>
                    <div className="text-lg font-black text-slate-900 mt-1">
                      {evaluation.rubricScores.depth}{" "}
                      <span className="text-xs font-semibold text-slate-400">/ 25</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70 text-center">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      STAR Structure
                    </div>
                    <div className="text-lg font-black text-slate-900 mt-1">
                      {evaluation.rubricScores.structure}{" "}
                      <span className="text-xs font-semibold text-slate-400">/ 25</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70 text-center">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Company Fit
                    </div>
                    <div className="text-lg font-black text-slate-900 mt-1">
                      {evaluation.rubricScores.alignment}{" "}
                      <span className="text-xs font-semibold text-slate-400">/ 25</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/70 text-center">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Delivery & Clarity
                    </div>
                    <div className="text-lg font-black text-slate-900 mt-1">
                      {evaluation.rubricScores.clarity}{" "}
                      <span className="text-xs font-semibold text-slate-400">/ 25</span>
                    </div>
                  </div>
                </div>

                {/* Key Strengths & Areas for Improvement (Side-by-Side with Progressive Disclosure) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Strengths */}
                  <div className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-200/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center space-x-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Key Strengths</span>
                      </h4>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-full">
                        {evaluation.strengths.length}
                      </span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {(showAllStrengths
                        ? evaluation.strengths
                        : evaluation.strengths.slice(0, 2)
                      ).map((str, idx) => (
                        <li key={idx} className="flex items-start space-x-2">
                          <span className="text-emerald-500 font-bold shrink-0">•</span>
                          <span className="leading-relaxed">{str}</span>
                        </li>
                      ))}
                    </ul>
                    {evaluation.strengths.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setShowAllStrengths(!showAllStrengths)}
                        className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center space-x-1 pt-1 transition"
                      >
                        <span>
                          {showAllStrengths
                            ? "Show top 2 strengths"
                            : `+ View all ${evaluation.strengths.length} strengths`}
                        </span>
                        {showAllStrengths ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Areas for Improvement */}
                  <div className="p-4 rounded-xl bg-amber-50/40 border border-amber-200/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center space-x-1.5">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                        <span>Areas for Improvement</span>
                      </h4>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded-full">
                        {evaluation.improvements.length}
                      </span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {(showAllImprovements
                        ? evaluation.improvements
                        : evaluation.improvements.slice(0, 2)
                      ).map((imp, idx) => (
                        <li key={idx} className="flex items-start space-x-2">
                          <span className="text-amber-500 font-bold shrink-0">•</span>
                          <span className="leading-relaxed">{imp}</span>
                        </li>
                      ))}
                    </ul>
                    {evaluation.improvements.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setShowAllImprovements(!showAllImprovements)}
                        className="text-[11px] font-bold text-amber-700 hover:text-amber-800 flex items-center space-x-1 pt-1 transition"
                      >
                        <span>
                          {showAllImprovements
                            ? "Show top 2 areas"
                            : `+ View all ${evaluation.improvements.length} improvements`}
                        </span>
                        {showAllImprovements ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Exemplary Model Answer Blueprint (Interactive Accordion) */}
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setBlueprintExpanded(!blueprintExpanded)}
                    className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-slate-100/60 transition"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                        <Sparkles className="h-4 w-4 text-brand-600" />
                        <span>Exemplary Answer Blueprint</span>
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Structured blueprint to compare against your candidate response.
                      </p>
                    </div>

                    <div className="flex items-center space-x-1 text-slate-400">
                      <span className="text-xs font-semibold hidden sm:inline">
                        {blueprintExpanded ? "Collapse All" : "Expand All"}
                      </span>
                      {blueprintExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </button>

                  {blueprintExpanded && (
                    <div className="p-4 sm:p-5 pt-0 space-y-3">
                      {modelAnswerSections.map((sec, i) => {
                        const isStageOpen = expandedBlueprintStages.has(i);
                        return (
                          <div
                            key={i}
                            className="rounded-xl bg-white border border-slate-200/70 shadow-2xs overflow-hidden transition-all"
                          >
                            <button
                              type="button"
                              onClick={() => toggleBlueprintStage(i)}
                              className="w-full p-3.5 sm:p-4 text-left flex items-start justify-between gap-3 hover:bg-slate-50/60 transition"
                            >
                              <div className="flex items-start space-x-3 min-w-0">
                                <span className="text-[10px] font-extrabold font-mono bg-brand-50 text-brand-700 px-2 py-0.5 rounded border border-brand-200/60 shrink-0 mt-0.5">
                                  {sec.step}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-slate-800">
                                    {sec.title}
                                  </div>
                                  {!isStageOpen && (
                                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                                      {sec.content}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center space-x-1 text-slate-400 shrink-0 mt-0.5">
                                <span className="text-[11px] font-semibold text-brand-600 hidden sm:inline">
                                  {isStageOpen ? "Hide" : "Expand"}
                                </span>
                                {isStageOpen ? (
                                  <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                                )}
                              </div>
                            </button>

                            {isStageOpen && (
                              <div className="px-4 pb-4 pt-1 sm:px-5 sm:pb-5 border-t border-slate-100 bg-slate-50/20">
                                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap pl-0 sm:pl-9">
                                  {sec.content}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
