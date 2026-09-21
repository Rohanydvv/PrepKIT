"use client";

import { useEffect, useState, useTransition } from "react";
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
        provenance: "edited", // Mark as hand-edited so it survives regeneration!
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

    setFeedbackMessage(
      !currentPin
        ? "Question pinned! It will be protected from all future category regenerations."
        : "Question unpinned."
    );
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  // 4. Reorder question up/down
  const handleMoveQuestion = (index: number, direction: "up" | "down") => {
    if (!record) return;
    const questions = [...record.kit.questions];
    const targetIdx = direction === "up" ? index - 1 : index + 1;

    if (targetIdx < 0 || targetIdx >= questions.length) return;

    const temp = questions[index];
    questions[index] = questions[targetIdx];
    questions[targetIdx] = temp;

    const updatedKit: InterviewKit = {
      ...record.kit,
      questions,
    };

    setRecord({ ...record, kit: updatedKit });
    triggerSave(updatedKit, record.meta);
  };

  // 5. Add Question Manually
  const handleAddQuestion = () => {
    if (!record) return;

    const newIdNum = record.kit.questions.length + 1;
    let newId = `q${newIdNum}`;
    while (record.kit.questions.some((q) => q.id === newId)) {
      newId = `q${Math.floor(Math.random() * 9000) + 1000}`;
    }

    const firstReqId = record.kit.role.requirements[0]?.id || "r1";
    const category: QuestionCategory =
      selectedCategory !== "all" ? selectedCategory : "technical";

    const newQuestion: Question = {
      id: newId,
      requirement_ids: [firstReqId],
      category,
      prompt: "New Custom Question (Click to edit inline)",
      answer_outline: "Outline key points, architecture choices, and trade-offs.",
      difficulty: 2,
    };

    const newQuestions = [...record.kit.questions, newQuestion];
    const newMeta = {
      ...record.meta,
      [newId]: { provenance: "manual" as const, is_pinned: true }, // Manually added items are protected
    };

    const updatedKit: InterviewKit = {
      ...record.kit,
      questions: newQuestions,
    };

    setRecord({ ...record, kit: updatedKit, meta: newMeta });
    triggerSave(updatedKit, newMeta);

    setFeedbackMessage("New custom question added with manual protection.");
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  // 6. Delete question
  const handleDeleteQuestion = (qId: string) => {
    if (!record) return;
    if (!confirm("Are you sure you want to delete this question?")) return;

    const newQuestions = record.kit.questions.filter((q) => q.id !== qId);
    const newMeta = { ...record.meta };
    delete newMeta[qId];

    // Remove from schedule as well to maintain referential integrity
    const updatedSchedule = {
      ...record.kit.schedule,
      days: record.kit.schedule.days.map((day) => ({
        ...day,
        question_ids: day.question_ids.filter((id) => id !== qId),
      })),
    };

    const updatedKit: InterviewKit = {
      ...record.kit,
      questions: newQuestions,
      schedule: updatedSchedule,
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
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-brand-600 mx-auto" />
            <p className="text-sm text-slate-500 mt-2">Loading Kit Builder...</p>
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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar kitId={id} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Kit Hero Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center space-x-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200">
                  {kit.source.company || "Target Company"}
                </span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs text-slate-500 font-medium">
                  {kit.role.seniority} Seniority
                </span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs text-slate-400">
                  Researched {new Date(kit.source.researched_at).toLocaleDateString()}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1.5">
                {kit.role.title}
              </h1>

              <div className="flex items-center space-x-2 mt-2 text-xs text-slate-500">
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                <a
                  href={kit.source.company_url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline text-brand-600 truncate max-w-sm"
                >
                  {kit.source.company_url}
                </a>
              </div>
            </div>

            {/* Quick Action Navigation Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href={`/kit/${id}/practice`}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shadow-2xs"
              >
                <BookOpen className="h-4 w-4" />
                <span>Practice Flashcards ({kit.flashcards.length})</span>
              </Link>

              <Link
                href={`/kit/${id}/schedule`}
                className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shadow-2xs"
              >
                <Calendar className="h-4 w-4" />
                <span>{kit.schedule.days_available}-Day Schedule</span>
              </Link>

              <Link
                href={`/kit/${id}/mock-interview`}
                className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shadow-2xs"
              >
                <Award className="h-4 w-4 text-amber-600" />
                <span>AI Mock Interview Coach</span>
              </Link>

              <Link
                href={`/kit/${id}/cheat-sheet`}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shadow-2xs"
              >
                <Printer className="h-4 w-4 text-slate-600" />
                <span>Print 1-Pager</span>
              </Link>
            </div>
          </div>

          {/* Feedback & Autosave Notice */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  saveStatus === "saved"
                    ? "bg-emerald-500"
                    : saveStatus === "saving"
                    ? "bg-amber-500 animate-pulse"
                    : "bg-rose-500"
                }`}
              />
              <span className="text-slate-500 font-medium">
                {saveStatus === "saved"
                  ? "All changes saved automatically"
                  : saveStatus === "saving"
                  ? "Saving changes to database..."
                  : "Unsaved changes"}
              </span>
            </div>

            {feedbackMessage && (
              <span className="text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 animate-in fade-in">
                {feedbackMessage}
              </span>
            )}
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex border-b border-slate-200 mb-6 space-x-6">
          <button
            onClick={() => setActiveTab("questions")}
            className={`pb-3 text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
              activeTab === "questions"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <span>Question Bank</span>
            <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-600 font-semibold">
              {kit.questions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("brief")}
            className={`pb-3 text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
              activeTab === "brief"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <span>Company Brief</span>
            <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-600 font-semibold">
              {kit.company_brief.sources.length} sources
            </span>
          </button>

          <button
            onClick={() => setActiveTab("role")}
            className={`pb-3 text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
              activeTab === "role"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <span>Role Requirements & Coverage</span>
            <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-600 font-semibold">
              {kit.role.requirements.length}
            </span>
          </button>
        </div>

        {/* TAB 1: QUESTION BANK BUILDER */}
        {activeTab === "questions" && (
          <div>
            {/* Category Filter & Section Actions Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex flex-wrap gap-1.5">
                {(["all", "technical", "behavioural", "system-design", "company-fit"] as const).map(
                  (cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                        selectedCategory === cat
                          ? "bg-brand-600 text-white shadow-2xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {cat.replace("-", " ")}
                    </button>
                  )
                )}
              </div>

              <div className="flex items-center space-x-2.5">
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
                    className={`bg-white rounded-xl border transition shadow-2xs hover:shadow-sm p-5 ${
                      isPinned
                        ? "border-indigo-300 ring-1 ring-indigo-200"
                        : "border-slate-200"
                    }`}
                  >
                    {/* Item Top Bar */}
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {q.id}
                        </span>

                        {/* Category Selector Dropdown */}
                        <select
                          value={q.category}
                          onChange={(e) =>
                            handleChangeCategory(q.id, e.target.value as QuestionCategory)
                          }
                          className="text-xs font-semibold px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200 focus:outline-none"
                        >
                          <option value="technical">Technical</option>
                          <option value="behavioural">Behavioural</option>
                          <option value="system-design">System Design</option>
                          <option value="company-fit">Company Fit</option>
                        </select>

                        {/* Difficulty rating */}
                        <span className="text-xs text-slate-400 font-medium">
                          Difficulty:{" "}
                          <span className="text-slate-700 font-bold">
                            {"★".repeat(q.difficulty)}
                            {"☆".repeat(3 - q.difficulty)}
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
                            ? "Manual Added"
                            : provenance === "edited"
                            ? "Hand Edited"
                            : "Generated"}
                        </span>
                      </div>

                      {/* Right controls: Pin, Reorder, Delete */}
                      <div className="flex items-center space-x-1.5">
                        {/* Pin Button */}
                        <button
                          onClick={() => handleTogglePin(q.id)}
                          title={
                            isPinned
                              ? "Pinned (Protected from regeneration)"
                              : "Pin to protect from regeneration"
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
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30"
                          title="Move Up"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>

                        {/* Reorder Down */}
                        <button
                          disabled={idx === filteredQuestions.length - 1}
                          onClick={() => handleMoveQuestion(idx, "down")}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30"
                          title="Move Down"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteQuestion(q.id)}
                          title="Delete Question"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
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
                        className="w-full text-sm font-semibold text-slate-900 p-2 rounded-lg border border-transparent hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:outline-none transition resize-y"
                      />
                    </div>

                    {/* Answer Outline (Inline Editable) */}
                    <div className="mb-3 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center space-x-1">
                        <Edit3 className="h-3 w-3" />
                        <span>Expected Answer Outline & Coaching Rubric</span>
                      </label>
                      <textarea
                        rows={2}
                        value={q.answer_outline}
                        onChange={(e) =>
                          handleEditQuestion(q.id, "answer_outline", e.target.value)
                        }
                        className="w-full text-xs text-slate-700 bg-transparent p-1.5 rounded-lg border border-transparent hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:outline-none transition resize-y"
                      />
                    </div>

                    {/* Footer: Target Requirements & AI Practice Link */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
                      <div className="flex items-center space-x-1 text-slate-500">
                        <span className="font-medium text-slate-400">Covers:</span>
                        {q.requirement_ids.map((reqId) => {
                          const req = kit.role.requirements.find((r) => r.id === reqId);
                          return (
                            <span
                              key={reqId}
                              title={req?.text}
                              className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono font-bold text-[11px]"
                            >
                              {reqId}
                            </span>
                          );
                        })}
                      </div>

                      <Link
                        href={`/kit/${id}/mock-interview?q=${q.id}`}
                        className="text-amber-700 hover:text-amber-800 font-semibold flex items-center space-x-1 bg-amber-50 hover:bg-amber-100 px-3 py-1 rounded-lg border border-amber-200 transition"
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

        {/* TAB 2: COMPANY BRIEF */}
        {activeTab === "brief" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <Building2 className="h-5 w-5 text-brand-600" />
                <span>Company Brief & Business Operating Model</span>
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

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Company Executive Summary
              </label>
              <textarea
                rows={3}
                value={kit.company_brief.summary}
                onChange={(e) => {
                  const updated = {
                    ...kit,
                    company_brief: { ...kit.company_brief, summary: e.target.value },
                  };
                  setRecord({ ...record, kit: updated });
                  triggerSave(updated, record.meta);
                }}
                className="w-full text-sm text-slate-800 p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                What They Do & Products
              </label>
              <textarea
                rows={3}
                value={kit.company_brief.what_they_do}
                onChange={(e) => {
                  const updated = {
                    ...kit,
                    company_brief: { ...kit.company_brief, what_they_do: e.target.value },
                  };
                  setRecord({ ...record, kit: updated });
                  triggerSave(updated, record.meta);
                }}
                className="w-full text-sm text-slate-800 p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition"
              />
            </div>

            {/* Sources Crawled */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Verified Research Sources Crawled
              </label>
              <div className="space-y-1.5">
                {kit.company_brief.sources.map((src, i) => (
                  <div
                    key={i}
                    className="flex items-center space-x-2 text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <a
                      href={src}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate hover:underline text-brand-600"
                    >
                      {src}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ROLE REQUIREMENTS & DETERMINISTIC COVERAGE */}
        {activeTab === "role" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Role Breakdown & Responsibilities
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Extracted from pasted job posting text.
                  </p>
                </div>
                <span className="text-xs bg-brand-50 text-brand-700 px-3 py-1 rounded-full font-bold border border-brand-200">
                  {kit.role.seniority} Level
                </span>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Key Responsibilities
                </h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
                  {kit.role.responsibilities.map((resp, idx) => (
                    <li key={idx}>{resp}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Requirements with MUST vs NICE badges */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Extracted Requirements & Coverage Audit
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Verified through {kit.coverage.passes} coverage checking pass(es).
                  </p>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <span className="font-semibold text-slate-600">
                    Gaps Remaining:
                  </span>
                  <span
                    className={`font-bold px-2.5 py-0.5 rounded-full ${
                      kit.coverage.uncovered_requirement_ids.length === 0
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    {kit.coverage.uncovered_requirement_ids.length === 0
                      ? "100% Covered"
                      : `${kit.coverage.uncovered_requirement_ids.length} uncovered`}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {kit.role.requirements.map((req) => {
                  const isUncovered = kit.coverage.uncovered_requirement_ids.includes(req.id);
                  const isMust = req.priority === "must";

                  return (
                    <div
                      key={req.id}
                      className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start space-x-3">
                        <span className="font-mono text-xs font-bold bg-white text-slate-700 px-2 py-1 rounded border border-slate-200 shadow-2xs">
                          {req.id}
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {req.text}
                          </div>
                          <div className="flex items-center space-x-2 mt-1">
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

                      <div className="flex items-center space-x-2 shrink-0">
                        {isUncovered ? (
                          <span className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-lg border border-rose-200">
                            Uncovered Gap
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 flex items-center space-x-1">
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
      </main>
    </div>
  );
}
