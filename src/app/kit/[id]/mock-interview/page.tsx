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
} from "lucide-react";

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
    } catch (err) {
      alert("Evaluation failed: " + (err as Error).message);
    } finally {
      setIsEvaluating(false);
    }
  };

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
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar kitId={kitId} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href={`/kit/${kitId}`}
            className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center space-x-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Builder</span>
          </Link>

          <span className="text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-800 px-3 py-1 rounded-full border border-amber-200 flex items-center space-x-1">
            <Award className="h-3.5 w-3.5 text-amber-600" />
            <span>AI Mock Interview Simulator</span>
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Question Selector & Question Details */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Select Interview Question to Rehearse
              </label>
              <select
                value={selectedQuestion?.id || ""}
                onChange={(e) => {
                  const match = kit.questions.find((q) => q.id === e.target.value);
                  if (match) {
                    setSelectedQuestion(match);
                    setCandidateAnswer("");
                    setEvaluation(null);
                  }
                }}
                className="w-full text-xs font-semibold p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              >
                {kit.questions.map((q) => (
                  <option key={q.id} value={q.id}>
                    [{q.category.toUpperCase()}] {q.id}: {q.prompt.slice(0, 50)}...
                  </option>
                ))}
              </select>
            </div>

            {selectedQuestion && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                    {selectedQuestion.id}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                    {selectedQuestion.category}
                  </span>
                </div>

                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Interviewer Question
                  </div>
                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    {selectedQuestion.prompt}
                  </h3>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600">
                  <div className="font-bold text-slate-700 mb-1 flex items-center space-x-1">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                    <span>Expected Talking Points:</span>
                  </div>
                  <p className="line-clamp-3">{selectedQuestion.answer_outline}</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Answer Input & Real-time Rubric Evaluation */}
          <div className="lg:col-span-2 space-y-6">
            {/* Answer Input Box */}
            <form onSubmit={handleEvaluate} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-900">
                  Your Answer (Type or Dictate Out Loud)
                </label>
                <button
                  type="button"
                  onClick={handleToggleVoice}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition ${
                    isRecording
                      ? "bg-rose-600 text-white animate-pulse"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  {isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  <span>{isRecording ? "Listening..." : "Voice Dictation"}</span>
                </button>
              </div>

              <textarea
                required
                rows={6}
                value={candidateAnswer}
                onChange={(e) => setCandidateAnswer(e.target.value)}
                placeholder="Structure your answer (e.g. Using the STAR framework for behavioural, or starting with high-level architecture and trade-offs for technical questions)..."
                className="w-full text-sm p-4 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-sans leading-relaxed"
              />

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isEvaluating || !candidateAnswer.trim()}
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-brand-600/20 transition flex items-center space-x-2"
                >
                  {isEvaluating ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Evaluating Answer with AI Rubric...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>Submit for 4-Point Rubric Feedback</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Evaluation Results Card */}
            {evaluation && (
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6 animate-in fade-in">
                {/* Score Banner */}
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-brand-50 to-indigo-50/50 rounded-xl border border-brand-100">
                  <div>
                    <span className="text-xs uppercase font-bold tracking-wider text-brand-600">
                      Overall Assessment Score
                    </span>
                    <h2 className="text-2xl font-black text-slate-900">
                      {evaluation.score} / 100
                    </h2>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-xs font-black uppercase px-3 py-1 rounded-full ${
                        evaluation.score >= 80
                          ? "bg-emerald-100 text-emerald-800"
                          : evaluation.score >= 60
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {evaluation.score >= 80 ? "Strong Hire" : evaluation.score >= 60 ? "Leaning Hire" : "Needs Review"}
                    </span>
                  </div>
                </div>

                {/* 4-Point Rubric Score Breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <div className="text-[11px] font-semibold text-slate-500">Technical Depth</div>
                    <div className="text-lg font-bold text-slate-900 mt-0.5">
                      {evaluation.rubricScores.depth} / 25
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <div className="text-[11px] font-semibold text-slate-500">STAR Structure</div>
                    <div className="text-lg font-bold text-slate-900 mt-0.5">
                      {evaluation.rubricScores.structure} / 25
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <div className="text-[11px] font-semibold text-slate-500">Company Alignment</div>
                    <div className="text-lg font-bold text-slate-900 mt-0.5">
                      {evaluation.rubricScores.alignment} / 25
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <div className="text-[11px] font-semibold text-slate-500">Delivery & Clarity</div>
                    <div className="text-lg font-bold text-slate-900 mt-0.5">
                      {evaluation.rubricScores.clarity} / 25
                    </div>
                  </div>
                </div>

                {/* Strengths & Improvements */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100">
                    <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2 flex items-center space-x-1">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>Key Strengths</span>
                    </h4>
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {evaluation.strengths.map((str, idx) => (
                        <li key={idx} className="flex items-start space-x-1.5">
                          <span className="text-emerald-500">•</span>
                          <span>{str}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-100">
                    <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center space-x-1">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span>Areas for Improvement</span>
                    </h4>
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {evaluation.improvements.map((imp, idx) => (
                        <li key={idx} className="flex items-start space-x-1.5">
                          <span className="text-amber-500">•</span>
                          <span>{imp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Model Answer Blueprint */}
                <div className="p-5 rounded-xl bg-indigo-50/40 border border-indigo-100">
                  <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                    <Sparkles className="h-4 w-4 text-brand-600" />
                    <span>Exemplary Model Answer Blueprint</span>
                  </h4>
                  <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {evaluation.modelAnswer}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
