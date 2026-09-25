"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { api } from "@/lib/api";
import { StoredKitRecord, Question } from "@/core/types";
import {
  Calendar,
  Clock,
  CheckCircle2,
  ArrowLeft,
  RefreshCw,
  Award,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ExternalLink,
} from "lucide-react";

export default function SchedulePage() {
  const params = useParams();
  const router = useRouter();
  const kitId = params?.id as string;

  const [record, setRecord] = useState<StoredKitRecord | null>(null);
  const [completedQIds, setCompletedQIds] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]));
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!kitId) return;
    api.kits
      .get(kitId)
      .then((res) => {
        setRecord(res.record);
        // Expand first 3 days or all days if <= 5
        const days = res.record.kit.schedule.days;
        if (days.length <= 5) {
          setExpandedDays(new Set(days.map((d) => d.day)));
        } else {
          setExpandedDays(new Set([1, 2, 3]));
        }
      })
      .catch((err) => {
        if (err?.status === 401) {
          router.push("/login");
          return;
        }
        alert("Failed to load schedule: " + (err as Error).message);
        router.push(`/kit/${kitId}`);
      })
      .finally(() => setLoading(false));
  }, [kitId, router]);

  const toggleComplete = (qId: string) => {
    setCompletedQIds((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  const toggleDayExpanded = (dayNum: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayNum)) next.delete(dayNum);
      else next.add(dayNum);
      return next;
    });
  };

  const handleRegenerateSchedule = async () => {
    setRegenerating(true);
    try {
      const res = await api.kits.regenerateSection(kitId, "schedule");
      setRecord(res.record);
    } catch (err) {
      alert("Failed to regenerate schedule: " + (err as Error).message);
    } finally {
      setRegenerating(false);
    }
  };

  if (loading || !record) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Navbar kitId={kitId} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-sm w-full mx-4">
            <RefreshCw className="h-8 w-8 animate-spin text-brand-600 mx-auto" />
            <h3 className="text-base font-bold text-slate-900 mt-4">Loading Schedule...</h3>
            <p className="text-xs text-slate-500 mt-1">
              Building personalized multi-day preparation calendar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const kit = record.kit;
  const schedule = kit.schedule;
  const questionsMap = new Map<string, Question>();
  kit.questions.forEach((q) => questionsMap.set(q.id, q));

  const totalMinutes = schedule.days.reduce((sum, d) => sum + d.minutes, 0);
  const allDaysExpanded = expandedDays.size >= schedule.days.length && schedule.days.length > 0;

  const toggleAllDays = () => {
    if (allDaysExpanded) {
      setExpandedDays(new Set());
    } else {
      setExpandedDays(new Set(schedule.days.map((d) => d.day)));
    }
  };

  const totalQuestionsInSchedule = schedule.days.reduce(
    (sum, d) => sum + d.question_ids.length,
    0
  );
  const completedInSchedule = Array.from(completedQIds).filter((id) =>
    schedule.days.some((d) => d.question_ids.includes(id))
  ).length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar kitId={kitId} />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Navigation & Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <Link
              href={`/kit/${kitId}`}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center space-x-1.5 bg-white border border-slate-200/80 px-3 py-1.5 rounded-xl shadow-2xs transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Workspace</span>
            </Link>

            <button
              disabled={regenerating}
              onClick={handleRegenerateSchedule}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-2xs transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
              <span>Re-allocate Schedule</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-7 shadow-2xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-700 bg-brand-50 px-2.5 py-0.5 rounded-md border border-brand-200/60">
                  Deterministic Study Plan
                </span>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-2">
                  {schedule.days_available}-Day Interview Preparation Roadmap
                </h1>
                <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                  Higher-priority must-have competencies land on early days, with final days dedicated to review, mock synthesis, and behavioral delivery.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <div className="flex items-center space-x-4 bg-slate-50/80 px-4 py-3 rounded-xl border border-slate-200/60 text-center">
                  <div>
                    <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                      Timeline
                    </div>
                    <div className="text-base font-extrabold text-slate-800 mt-0.5">
                      {schedule.days_available} Days
                    </div>
                  </div>
                  <div className="h-7 w-px bg-slate-200" />
                  <div>
                    <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                      Est. Effort
                    </div>
                    <div className="text-base font-extrabold text-brand-600 mt-0.5">
                      {Math.round(totalMinutes / 60)} hrs
                    </div>
                  </div>
                  <div className="h-7 w-px bg-slate-200" />
                  <div>
                    <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                      Progress
                    </div>
                    <div className="text-base font-extrabold text-emerald-600 mt-0.5">
                      {completedInSchedule} / {totalQuestionsInSchedule}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={toggleAllDays}
                  className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition"
                >
                  {allDaysExpanded ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      <span>Collapse All</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      <span>Expand All</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Days Timeline: Compact Roadmap Layout */}
        <div className="space-y-4">
          {schedule.days.map((day) => {
            const dayQuestions = day.question_ids
              .map((id) => questionsMap.get(id))
              .filter(Boolean) as Question[];

            const isExpanded = expandedDays.has(day.day);
            const dayCompletedCount = dayQuestions.filter((q) =>
              completedQIds.has(q.id)
            ).length;
            const isDayAllDone =
              dayQuestions.length > 0 && dayCompletedCount === dayQuestions.length;

            return (
              <div
                key={day.day}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden transition-all"
              >
                {/* Day Header Bar (Clickable Accordion) */}
                <button
                  type="button"
                  onClick={() => toggleDayExpanded(day.day)}
                  className="w-full px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left hover:bg-slate-50/60 transition group"
                >
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <span
                      className={`h-9 w-14 rounded-xl font-mono font-black text-xs flex items-center justify-center shrink-0 border transition ${
                        isDayAllDone
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-slate-100 text-slate-800 border-slate-200/80 group-hover:border-brand-300"
                      }`}
                    >
                      DAY {day.day < 10 ? `0${day.day}` : day.day}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                          {day.focus}
                        </h3>
                        {isDayAllDone && (
                          <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            Completed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                        <span>{dayQuestions.length} practice question(s)</span>
                        <span>•</span>
                        <span>{day.minutes} min</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 self-end sm:self-center shrink-0">
                    {dayQuestions.length > 0 && (
                      <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60">
                        {dayCompletedCount} / {dayQuestions.length} done
                      </span>
                    )}

                    <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 group-hover:text-slate-700 transition">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Day Questions List (Revealed when expanded) */}
                {isExpanded && (
                  <div className="px-5 sm:px-6 pb-5 pt-1 border-t border-slate-100 bg-slate-50/30">
                    {dayQuestions.length === 0 ? (
                      <div className="py-4 text-center text-xs text-slate-400">
                        Reinforcement, mental rehearsal, and rest day.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {dayQuestions.map((q) => {
                          const isDone = completedQIds.has(q.id);

                          return (
                            <div
                              key={q.id}
                              className="py-3 first:pt-2 last:pb-1 flex items-start justify-between gap-4 group"
                            >
                              <div className="flex items-start space-x-3 flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => toggleComplete(q.id)}
                                  className="mt-0.5 text-slate-400 hover:text-brand-600 transition shrink-0"
                                >
                                  {isDone ? (
                                    <CheckSquare className="h-5 w-5 text-emerald-600" />
                                  ) : (
                                    <Square className="h-5 w-5 text-slate-300 group-hover:text-slate-400" />
                                  )}
                                </button>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center space-x-2 mb-1">
                                    <span className="font-mono text-[11px] font-bold text-slate-400">
                                      {q.id.toUpperCase()}
                                    </span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider bg-brand-50 text-brand-700 px-2 py-0.5 rounded border border-brand-200/60">
                                      {q.category.replace("-", " ")}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-400">
                                      <span className="text-amber-500 font-bold">
                                        {"★".repeat(q.difficulty)}
                                      </span>
                                      <span className="text-slate-200">
                                        {"★".repeat(3 - q.difficulty)}
                                      </span>
                                    </span>
                                  </div>

                                  <p
                                    className={`text-xs sm:text-sm font-semibold transition leading-snug ${
                                      isDone
                                        ? "line-through text-slate-400"
                                        : "text-slate-800"
                                    }`}
                                  >
                                    {q.prompt}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center space-x-2 shrink-0 self-center">
                                <Link
                                  href={`/kit/${kitId}/mock-interview?q=${q.id}`}
                                  className="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200/80 transition flex items-center space-x-1"
                                >
                                  <Award className="h-3 w-3 text-amber-600" />
                                  <span className="hidden sm:inline">Mock Coach</span>
                                  <span className="sm:hidden">Mock</span>
                                </Link>

                                <Link
                                  href={`/kit/${kitId}`}
                                  className="text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 transition hidden md:flex items-center space-x-1"
                                  title="View in Workspace"
                                >
                                  <ExternalLink className="h-3 w-3 text-slate-400" />
                                  <span>Details</span>
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
