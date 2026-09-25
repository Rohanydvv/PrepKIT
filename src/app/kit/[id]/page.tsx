"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { api } from "@/lib/api";
import {
  InterviewKit,
  StoredKitRecord,
  Question,
  QuestionCategory,
} from "@/core/types";
import {
  Sparkles,
  Building2,
  Calendar,
  BookOpen,
  Pin,
  PinOff,
  Trash2,
  PlusCircle,
  RefreshCw,
  Award,
  Printer,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Edit3,
  Layers,
  ArrowRight,
  Clock,
} from "lucide-react";

export default function KitBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [record, setRecord] = useState<StoredKitRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"questions" | "role" | "brief">("questions");
  const [selectedCategory, setSelectedCategory] = useState<QuestionCategory | "all">("all");

  // Save and regeneration states
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.kits
      .get(id)
      .then((res) => {
        setRecord(res.record);
      })
      .catch((err) => {
        if (err?.status === 401) {
          router.push("/login");
          return;
        }
        alert("Failed to load kit: " + (err as Error).message);
        router.push("/");
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  // Debounced auto-save function
  const triggerSave = async (updatedKit: InterviewKit, updatedMeta: StoredKitRecord["meta"]) => {
    setSaveStatus("saving");
    try {
      const res = await api.kits.update(id, updatedKit, updatedMeta);
      setRecord(res.record);
      setSaveStatus("saved");
    } catch (err) {
      console.error("Save error:", err);
      setSaveStatus("unsaved");
    }
  };

  // 1. Inline edit question
  const handleEditQuestion = (
    qId: string,
    field: "prompt" | "answer_outline",
    value: string
  ) => {
    if (!record) return;

    const newQuestions = record.kit.questions.map((q) => {
      if (q.id === qId) {
        return { ...q, [field]: value };
      }
      return q;
    });

    const newMeta = { ...record.meta };
    if (newMeta[qId]?.provenance !== "manual") {
      newMeta[qId] = {
        ...(newMeta[qId] || { is_pinned: false }),
        provenance: "edited", // Mark as hand-edited so it survives regeneration
      };
    }

    const updatedKit: InterviewKit = {
      ...record.kit,
      questions: newQuestions,
    };

    setRecord({ ...record, kit: updatedKit, meta: newMeta });
    triggerSave(updatedKit, newMeta);
  };

  // 2. Change category (Move question)
  const handleChangeCategory = (qId: string, newCategory: QuestionCategory) => {
    if (!record) return;

    const newQuestions = record.kit.questions.map((q) => {
      if (q.id === qId) {
        return { ...q, category: newCategory };
      }
      return q;
    });

    const newMeta = { ...record.meta };
    newMeta[qId] = {
      ...(newMeta[qId] || { is_pinned: false }),
      provenance: "edited",
    };

    const updatedKit: InterviewKit = {
      ...record.kit,
      questions: newQuestions,
    };

    setRecord({ ...record, kit: updatedKit, meta: newMeta });
    triggerSave(updatedKit, newMeta);
  };

  // 3. Toggle Pin status
  const handleTogglePin = (qId: string) => {
    if (!record) return;

    const currentPin = record.meta[qId]?.is_pinned || false;
    const newMeta = {
      ...record.meta,
      [qId]: {
        ...(record.meta[qId] || { provenance: "generated" }),
        is_pinned: !currentPin,
      },
    };

    setRecord({ ...record, meta: newMeta });
    triggerSave(record.kit, newMeta);
  };

  // 4. Move question up/down
  const handleMoveQuestion = (index: number, direction: "up" | "down") => {
    if (!record) return;

    const questions = [...record.kit.questions];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const temp = questions[index];
    questions[index] = questions[targetIndex];
    questions[targetIndex] = temp;

    const updatedKit: InterviewKit = {
      ...record.kit,
      questions,
    };

    setRecord({ ...record, kit: updatedKit });
    triggerSave(updatedKit, record.meta);
  };

  // 5. Delete question
  const handleDeleteQuestion = (qId: string) => {
    if (!record) return;
    if (!confirm("Are you sure you want to remove this question from the preparation kit?")) return;

    const updatedKit: InterviewKit = {
      ...record.kit,
      questions: record.kit.questions.filter((q) => q.id !== qId),
    };

    const newMeta = { ...record.meta };
    delete newMeta[qId];

    setRecord({ ...record, kit: updatedKit, meta: newMeta });
    triggerSave(updatedKit, newMeta);
  };

  // 6. Add Custom Question
  const handleAddQuestion = () => {
    if (!record) return;

    const nextNum = record.kit.questions.length + 1;
    const newQId = `q${nextNum}`;
    const defaultReqId = record.kit.role.requirements[0]?.id || "r1";

    const newQuestion: Question = {
      id: newQId,
      requirement_ids: [defaultReqId],
      category: selectedCategory === "all" ? "technical" : selectedCategory,
      prompt: "Click here to formulate your custom interview question prompt...",
      answer_outline: "Outline the key architectural talking points, trade-offs, and expected candidate answers...",
      difficulty: 2,
    };

    const newQuestions = [...record.kit.questions, newQuestion];
    const newMeta = {
      ...record.meta,
      [newQId]: {
        provenance: "manual" as const,
        is_pinned: true,
      },
    };

    const updatedKit: InterviewKit = {
      ...record.kit,
      questions: newQuestions,
    };

    setRecord({ ...record, kit: updatedKit, meta: newMeta });
    triggerSave(updatedKit, newMeta);
  };

  // 7. Regenerate Section (with State Preservation!)
  const handleRegenerate = async (
    section: "company_brief" | "category" | "schedule",
    category?: string
  ) => {
    setRegeneratingSection(category || section);
    try {
      const res = await api.kits.regenerateSection(id, section, category);
      setRecord(res.record);
      setFeedbackMessage(
        `Regenerated ${category || section}. Your edited, manual, and pinned items were safely preserved!`
      );
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err) {
      alert("Regeneration failed: " + (err as Error).message);
    } finally {
      setRegeneratingSection(null);
    }
  };

  if (loading || !record) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-sm w-full mx-4">
            <RefreshCw className="h-8 w-8 animate-spin text-brand-600 mx-auto" />
            <h3 className="text-base font-bold text-slate-900 mt-4">Loading Kit Workspace...</h3>
            <p className="text-xs text-slate-500 mt-1">
              Retrieving question banks, research briefs, and schedule models.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const kit = record.kit;
  const filteredQuestions =
    selectedCategory === "all"
      ? kit.questions
      : kit.questions.filter((q) => q.category === selectedCategory);

  const totalReqs = kit.role.requirements.length;
  const uncoveredReqs = kit.coverage.uncovered_requirement_ids.length;
  const coveredReqs = totalReqs - uncoveredReqs;
  const coveragePercent = totalReqs > 0 ? Math.round((coveredReqs / totalReqs) * 100) : 100;

  const techCount = kit.questions.filter((q) => q.category === "technical").length;
  const sysCount = kit.questions.filter((q) => q.category === "system-design").length;
  const behCount = kit.questions.filter((q) => q.category === "behavioural").length;
  const fitCount = kit.questions.filter((q) => q.category === "company-fit").length;
  const totalMinutes = kit.schedule.days.reduce((sum, d) => sum + d.minutes, 0);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar kitId={id} />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Main SaaS Workspace Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
          {/* ======================================================== */}
          {/* LEFT SIDEBAR: KIT OVERVIEW & QUICK NAVIGATION           */}
          {/* ======================================================== */}
          <aside className="space-y-5 lg:sticky lg:top-24">
            {/* Kit Profile Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
              <div className="flex items-center space-x-2 text-xs font-semibold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-lg border border-brand-200/60 w-fit mb-3">
                <Building2 className="h-3.5 w-3.5" />
                <span className="truncate max-w-[200px]">{kit.source.company || "Target Company"}</span>
              </div>

              <h2 className="text-lg font-black text-slate-900 tracking-tight leading-snug">
                {kit.role.title}
              </h2>

              <div className="flex items-center space-x-2 mt-2 text-xs text-slate-500">
                <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold text-slate-700">
                  {kit.role.seniority}
                </span>
                <span>•</span>
                <span className="truncate">
                  {new Date(kit.source.researched_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>

              {kit.source.company_url && (
                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center space-x-1.5 text-xs text-slate-500">
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <a
                    href={kit.source.company_url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline text-brand-600 truncate"
                  >
                    {kit.source.company_url.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                </div>
              )}
            </div>

            {/* Preparation Metrics & Readiness Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold text-slate-700">Requirement Coverage</span>
                  <span className="font-black text-brand-700">{coveragePercent}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-brand-600 rounded-full transition-all duration-500"
                    style={{ width: `${coveragePercent}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2.5 pt-1 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium flex items-center space-x-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Coverage Audit</span>
                  </span>
                  <span className="font-bold text-slate-900">
                    {coveredReqs} / {totalReqs} requirements
                  </span>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium flex items-center space-x-1.5">
                    <Layers className="h-3.5 w-3.5 text-brand-600" />
                    <span>Questions</span>
                  </span>
                  <span className="font-bold text-slate-900">{kit.questions.length} questions</span>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium flex items-center space-x-1.5">
                    <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Timeline</span>
                  </span>
                  <span className="font-bold text-slate-900">{kit.schedule.days_available} days</span>
                </div>

                <div className="flex items-center justify-between py-1.5">
                  <span className="text-slate-500 font-medium flex items-center space-x-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-amber-600" />
                    <span>Flashcards</span>
                  </span>
                  <span className="font-bold text-slate-900">{kit.flashcards.length} cards</span>
                </div>
              </div>
            </div>

            {/* Quick Workspace Navigation Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-2">
                Workspace Sections
              </div>
              <nav className="space-y-1">
                <button
                  onClick={() => setActiveTab("questions")}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
                    activeTab === "questions"
                      ? "bg-brand-50 text-brand-700 font-bold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <Layers className="h-4 w-4" />
                    <span>Interview Questions</span>
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {kit.questions.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("brief")}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
                    activeTab === "brief"
                      ? "bg-brand-50 text-brand-700 font-bold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <Building2 className="h-4 w-4" />
                    <span>Company Brief</span>
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {kit.company_brief.sources.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab("role")}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
                    activeTab === "role"
                      ? "bg-brand-50 text-brand-700 font-bold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className="flex items-center space-x-2">
                    <ShieldCheck className="h-4 w-4" />
                    <span>Role & Requirements</span>
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {kit.role.requirements.length}
                  </span>
                </button>

                <div className="pt-2 mt-2 border-t border-slate-100">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
                    Practice Modules
                  </div>

                  <Link
                    href={`/kit/${id}/practice`}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center justify-between transition"
                  >
                    <span className="flex items-center space-x-2">
                      <BookOpen className="h-4 w-4 text-brand-600" />
                      <span>Flashcards Practice</span>
                    </span>
                    <ArrowRight className="h-3 w-3 text-slate-400" />
                  </Link>

                  <Link
                    href={`/kit/${id}/schedule`}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center justify-between transition"
                  >
                    <span className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-emerald-600" />
                      <span>{kit.schedule.days_available}-Day Schedule</span>
                    </span>
                    <ArrowRight className="h-3 w-3 text-slate-400" />
                  </Link>

                  <Link
                    href={`/kit/${id}/mock-interview`}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center justify-between transition"
                  >
                    <span className="flex items-center space-x-2">
                      <Award className="h-4 w-4 text-amber-600" />
                      <span>AI Mock Coach</span>
                    </span>
                    <ArrowRight className="h-3 w-3 text-slate-400" />
                  </Link>

                  <Link
                    href={`/kit/${id}/cheat-sheet`}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center justify-between transition"
                  >
                    <span className="flex items-center space-x-2">
                      <Printer className="h-4 w-4 text-slate-600" />
                      <span>Print 1-Pager</span>
                    </span>
                    <ArrowRight className="h-3 w-3 text-slate-400" />
                  </Link>
                </div>
              </nav>

              {/* Autosave status row */}
              <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] px-1">
                <div className="flex items-center space-x-1.5">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      saveStatus === "saved"
                        ? "bg-emerald-500"
                        : saveStatus === "saving"
                        ? "bg-amber-500 animate-pulse"
                        : "bg-rose-500"
                    }`}
                  />
                  <span className="text-slate-500">
                    {saveStatus === "saved"
                      ? "Saved to cloud"
                      : saveStatus === "saving"
                      ? "Saving edits..."
                      : "Unsaved"}
                  </span>
                </div>

                {feedbackMessage && (
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Updated
                  </span>
                )}
              </div>
            </div>
          </aside>

          {/* ======================================================== */}
          {/* RIGHT MAIN CONTENT AREA                                 */}
          {/* ======================================================== */}
          <div className="space-y-6 min-w-0">
            {/* Main Header Banner */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-6 sm:p-7">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest bg-brand-50 text-brand-700 px-2.5 py-0.5 rounded-md border border-brand-200/60">
                      Interview Preparation Workspace
                    </span>
                    <span className="text-xs text-slate-400">•</span>
                    <span className="text-xs font-semibold text-slate-600">
                      {kit.source.company || "Target Company"}
                    </span>
                  </div>

                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">
                    {kit.role.title}
                  </h1>

                  <p className="text-xs sm:text-sm text-slate-500 mt-1.5 flex items-center space-x-2">
                    <span>{kit.role.seniority} Seniority</span>
                    <span>•</span>
                    <span>
                      Generated{" "}
                      {new Date(kit.source.researched_at).toLocaleDateString(undefined, {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </p>
                </div>

                {/* Primary Quick Action Buttons */}
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <Link
                    href={`/kit/${id}/practice`}
                    className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-2xs transition hover:border-slate-300"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-brand-600" />
                    <span>Flashcards ({kit.flashcards.length})</span>
                  </Link>

                  <Link
                    href={`/kit/${id}/schedule`}
                    className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-2xs transition hover:border-slate-300"
                  >
                    <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{kit.schedule.days_available}-Day Schedule</span>
                  </Link>

                  <Link
                    href={`/kit/${id}/mock-interview`}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-sm shadow-brand-600/20 transition"
                  >
                    <Award className="h-4 w-4" />
                    <span>AI Mock Coach</span>
                  </Link>

                  <Link
                    href={`/kit/${id}/cheat-sheet`}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
                    title="Print 1-Pager Cheat Sheet"
                  >
                    <Printer className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              {/* 4 Summary Overview Cards Row */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 mt-6 pt-6 border-t border-slate-100">
                <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-100">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Questions
                  </div>
                  <div className="text-xl font-black text-slate-900 mt-0.5">
                    {kit.questions.length}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {techCount} Tech • {behCount} STAR
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-100">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Requirements
                  </div>
                  <div className="text-xl font-black text-slate-900 mt-0.5">
                    {coveredReqs} / {totalReqs}
                  </div>
                  <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                    {coveragePercent}% Covered
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-100">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Timeline
                  </div>
                  <div className="text-xl font-black text-slate-900 mt-0.5">
                    {kit.schedule.days_available} Days
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    ~{totalMinutes} Study Minutes
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-100">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Verification
                  </div>
                  <div className="text-xl font-black text-slate-900 mt-0.5">
                    Pass {kit.coverage.passes}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Deterministic Gap Audit
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs Bar */}
            <div className="flex items-center space-x-6 border-b border-slate-200">
              <button
                onClick={() => setActiveTab("questions")}
                className={`pb-3 text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
                  activeTab === "questions"
                    ? "border-brand-600 text-brand-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>Question Bank</span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    activeTab === "questions"
                      ? "bg-brand-50 text-brand-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {kit.questions.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("brief")}
                className={`pb-3 text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
                  activeTab === "brief"
                    ? "border-brand-600 text-brand-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>Company Brief</span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    activeTab === "brief"
                      ? "bg-brand-50 text-brand-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {kit.company_brief.sources.length} sources
                </span>
              </button>

              <button
                onClick={() => setActiveTab("role")}
                className={`pb-3 text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
                  activeTab === "role"
                    ? "border-brand-600 text-brand-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>Role & Requirements</span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    activeTab === "role"
                      ? "bg-brand-50 text-brand-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {kit.role.requirements.length}
                </span>
              </button>
            </div>

            {/* ======================================================== */}
            {/* TAB 1: QUESTION BANK BUILDER                             */}
            {/* ======================================================== */}
            {activeTab === "questions" && (
              <div className="space-y-4">
                {/* Category Filter Pills & Actions Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="flex flex-wrap gap-1.5">
                    {(["all", "technical", "behavioural", "system-design", "company-fit"] as const).map(
                      (cat) => {
                        const count =
                          cat === "all"
                            ? kit.questions.length
                            : kit.questions.filter((q) => q.category === cat).length;

                        return (
                          <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition flex items-center space-x-1.5 ${
                              selectedCategory === cat
                                ? "bg-brand-600 text-white shadow-2xs"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            <span>{cat.replace("-", " ")}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                selectedCategory === cat
                                  ? "bg-brand-700 text-white"
                                  : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      }
                    )}
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {selectedCategory !== "all" && (
                      <button
                        disabled={regeneratingSection === selectedCategory}
                        onClick={() => handleRegenerate("category", selectedCategory)}
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${
                            regeneratingSection === selectedCategory ? "animate-spin" : ""
                          }`}
                        />
                        <span>Regenerate {selectedCategory}</span>
                      </button>
                    )}

                    <button
                      onClick={handleAddQuestion}
                      className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-2xs transition"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      <span>Add Question</span>
                    </button>
                  </div>
                </div>

                {/* Questions List */}
                <div className="space-y-4">
                  {filteredQuestions.map((q, idx) => {
                    const itemMeta = record.meta[q.id] || { provenance: "generated", is_pinned: false };
                    const isPinned = itemMeta.is_pinned;
                    const provenance = itemMeta.provenance;

                    return (
                      <div
                        key={q.id}
                        className={`bg-white rounded-2xl border transition shadow-2xs hover:shadow-xs p-5 sm:p-6 ${
                          isPinned
                            ? "border-indigo-300 ring-1 ring-indigo-200/70"
                            : "border-slate-200/80"
                        }`}
                      >
                        {/* Question Top Row Metadata & Actions */}
                        <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-slate-100">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200/60">
                              {q.id.toUpperCase()}
                            </span>

                            {/* Category Selector Dropdown */}
                            <select
                              value={q.category}
                              onChange={(e) =>
                                handleChangeCategory(q.id, e.target.value as QuestionCategory)
                              }
                              className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200/60 focus:outline-none capitalize"
                            >
                              <option value="technical">Technical</option>
                              <option value="behavioural">Behavioural</option>
                              <option value="system-design">System Design</option>
                              <option value="company-fit">Company Fit</option>
                            </select>

                            {/* Difficulty Stars */}
                            <span className="text-xs font-semibold text-slate-400 flex items-center space-x-1">
                              <span>Difficulty:</span>
                              <span className="text-amber-500 font-bold">
                                {"★".repeat(q.difficulty)}
                              </span>
                              <span className="text-slate-200">
                                {"★".repeat(3 - q.difficulty)}
                              </span>
                            </span>

                            {/* Provenance Badge */}
                            <span
                              className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                                provenance === "manual"
                                  ? "bg-purple-50 text-purple-700 border border-purple-200"
                                  : provenance === "edited"
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-slate-50 text-slate-500 border border-slate-200"
                              }`}
                            >
                              {provenance === "manual"
                                ? "Manual"
                                : provenance === "edited"
                                ? "Edited"
                                : "Generated"}
                            </span>
                          </div>

                          {/* Right Controls: Pin, Reorder, Delete */}
                          <div className="flex items-center space-x-1">
                            {/* Pin Button */}
                            <button
                              onClick={() => handleTogglePin(q.id)}
                              title={
                                isPinned
                                  ? "Pinned (Protected from regeneration)"
                                  : "Pin question to protect from regeneration"
                              }
                              className={`p-1.5 rounded-lg text-xs font-medium transition ${
                                isPinned
                                  ? "bg-indigo-600 text-white"
                                  : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                              }`}
                            >
                              {isPinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                            </button>

                            {/* Reorder Up */}
                            <button
                              disabled={idx === 0}
                              onClick={() => handleMoveQuestion(idx, "up")}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-30"
                              title="Move Up"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>

                            {/* Reorder Down */}
                            <button
                              disabled={idx === filteredQuestions.length - 1}
                              onClick={() => handleMoveQuestion(idx, "down")}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-30"
                              title="Move Down"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => handleDeleteQuestion(q.id)}
                              title="Delete Question"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Question Prompt (Inline Editable) */}
                        <div className="mb-3">
                          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Question Prompt (Click to edit)
                          </label>
                          <textarea
                            rows={2}
                            value={q.prompt}
                            onChange={(e) => handleEditQuestion(q.id, "prompt", e.target.value)}
                            className="w-full text-base font-bold text-slate-900 p-2.5 rounded-xl border border-transparent hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:outline-none transition resize-y leading-snug"
                          />
                        </div>

                        {/* Answer Outline (Inline Editable) */}
                        <div className="mb-3.5 bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center space-x-1.5">
                            <Edit3 className="h-3 w-3 text-slate-400" />
                            <span>Expected Answer Outline & Coaching Rubric</span>
                          </label>
                          <textarea
                            rows={2}
                            value={q.answer_outline}
                            onChange={(e) =>
                              handleEditQuestion(q.id, "answer_outline", e.target.value)
                            }
                            className="w-full text-xs text-slate-700 bg-transparent p-1.5 rounded-lg border border-transparent hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:outline-none transition resize-y leading-relaxed"
                          />
                        </div>

                        {/* Question Card Footer */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
                          <div className="flex items-center space-x-1.5 text-slate-500">
                            <span className="font-medium text-slate-400">Covers:</span>
                            {q.requirement_ids.map((reqId) => {
                              const req = kit.role.requirements.find((r) => r.id === reqId);
                              return (
                                <span
                                  key={reqId}
                                  title={req?.text}
                                  className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono font-bold text-[11px] border border-slate-200/50"
                                >
                                  {reqId}
                                </span>
                              );
                            })}
                          </div>

                          <Link
                            href={`/kit/${id}/mock-interview?q=${q.id}`}
                            className="text-brand-700 hover:text-brand-800 font-semibold flex items-center space-x-1.5 bg-brand-50 hover:bg-brand-100 px-3 py-1 rounded-lg border border-brand-200/60 transition shadow-2xs"
                          >
                            <Award className="h-3.5 w-3.5" />
                            <span>Rehearse with AI Mock Coach</span>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* TAB 2: COMPANY BRIEF                                     */}
            {/* ======================================================== */}
            {activeTab === "brief" && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-2xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                    <Building2 className="h-5 w-5 text-brand-600" />
                    <span>Company Brief & Operating Model</span>
                  </h2>

                  <button
                    disabled={regeneratingSection === "company_brief"}
                    onClick={() => handleRegenerate("company_brief")}
                    className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        regeneratingSection === "company_brief" ? "animate-spin" : ""
                      }`}
                    />
                    <span>Regenerate Brief</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column: Summary and Core Products */}
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Company Executive Summary
                      </label>
                      <textarea
                        rows={4}
                        value={kit.company_brief.summary}
                        onChange={(e) => {
                          const updated = {
                            ...kit,
                            company_brief: { ...kit.company_brief, summary: e.target.value },
                          };
                          setRecord({ ...record, kit: updated });
                          triggerSave(updated, record.meta);
                        }}
                        className="w-full text-sm text-slate-800 p-3.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition leading-relaxed"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        What They Do & Product Architecture
                      </label>
                      <textarea
                        rows={4}
                        value={kit.company_brief.what_they_do}
                        onChange={(e) => {
                          const updated = {
                            ...kit,
                            company_brief: { ...kit.company_brief, what_they_do: e.target.value },
                          };
                          setRecord({ ...record, kit: updated });
                          triggerSave(updated, record.meta);
                        }}
                        className="w-full text-sm text-slate-800 p-3.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition leading-relaxed"
                      />
                    </div>
                  </div>

                  {/* Right Column: Research Sources Crawled */}
                  <div className="space-y-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Verified Research Sources Crawled ({kit.company_brief.sources.length})
                    </label>

                    <div className="space-y-2">
                      {kit.company_brief.sources.map((src, i) => (
                        <div
                          key={i}
                          className="flex items-center space-x-2.5 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60"
                        >
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                          <a
                            href={src}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate hover:underline text-brand-600 font-medium"
                          >
                            {src}
                          </a>
                        </div>
                      ))}
                      {kit.company_brief.sources.length === 0 && (
                        <p className="text-xs text-slate-400 italic">No external web sources were discovered.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/* TAB 3: ROLE REQUIREMENTS & COVERAGE                      */}
            {/* ======================================================== */}
            {activeTab === "role" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Role Profile & Responsibilities */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-7 shadow-2xs space-y-5">
                  <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Role Profile</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Extracted directly from job description.
                      </p>
                    </div>
                    <span className="text-xs bg-brand-50 text-brand-700 px-3 py-1 rounded-full font-bold border border-brand-200/60">
                      {kit.role.seniority}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                      Key Responsibilities
                    </h3>
                    <ul className="space-y-2 text-sm text-slate-700">
                      {kit.role.responsibilities.map((resp, idx) => (
                        <li key={idx} className="flex items-start space-x-2">
                          <span className="text-brand-600 font-bold">•</span>
                          <span>{resp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Right: Requirements Audit & Coverage */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-7 shadow-2xs space-y-5">
                  <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        Requirements Audit ({kit.role.requirements.length})
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Verified across {kit.coverage.passes} coverage check pass(es).
                      </p>
                    </div>

                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-full ${
                        uncoveredReqs === 0
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {uncoveredReqs === 0 ? "100% Covered" : `${uncoveredReqs} Uncovered`}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {kit.role.requirements.map((req) => {
                      const isUncovered = kit.coverage.uncovered_requirement_ids.includes(req.id);
                      const isMust = req.priority === "must";

                      return (
                        <div
                          key={req.id}
                          className="p-3.5 rounded-xl border border-slate-200/70 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-start space-x-3">
                            <span className="font-mono text-xs font-bold bg-white text-slate-700 px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                              {req.id}
                            </span>
                            <div>
                              <div className="text-sm font-semibold text-slate-900 leading-snug">
                                {req.text}
                              </div>
                              <div className="flex items-center space-x-2 mt-1.5">
                                <span
                                  className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                                    isMust
                                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                                      : "bg-blue-50 text-blue-700 border border-blue-200"
                                  }`}
                                >
                                  {isMust ? "Must-Have" : "Nice-to-Have"}
                                </span>
                                <span className="text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                  {req.kind}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isUncovered ? (
                              <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                                Gap
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center space-x-1">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                <span>Covered</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
