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
  BookOpen,
  CheckSquare,
  Square,
  Sparkles,
} from "lucide-react";

export default function SchedulePage() {
  const params = useParams();
  const router = useRouter();
  const kitId = params?.id as string;

  const [record, setRecord] = useState<StoredKitRecord | null>(null);
  const [completedQIds, setCompletedQIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!kitId) return;
    api.kits
      .get(kitId)
      .then((res) => setRecord(res.record))
      .catch((err) => {
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
      <div className="min-h-screen flex flex-col">
        <Navbar kitId={kitId} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      </div>
    );
  }

  const kit = record.kit;
  const schedule = kit.schedule;
  const questionsMap = new Map<string, Question>();
  kit.questions.forEach((q) => questionsMap.set(q.id, q));

  const totalMinutes = schedule.days.reduce((sum, d) => sum + d.minutes, 0);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar kitId={kitId} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* Navigation & Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <Link
              href={`/kit/${kitId}`}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center space-x-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Builder</span>
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

          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-brand-600">
                  Deterministic Study Plan
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
                  {schedule.days_available}-Day Interview Preparation Roadmap
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Harder and higher-priority must-have competencies land on early days, with final days dedicated to review and behavioral synthesis.
                </p>
              </div>

              <div className="flex items-center space-x-4 shrink-0 bg-slate-50 px-4 py-3 rounded-xl border border-slate-100 text-center">
                <div>
                  <div className="text-xs text-slate-400 font-medium">Total Timeline</div>
                  <div className="text-lg font-bold text-slate-800">
                    {schedule.days_available} Days
                  </div>
                </div>
                <div className="h-8 w-px bg-slate-200" />
                <div>
                  <div className="text-xs text-slate-400 font-medium">Estimated Time</div>
                  <div className="text-lg font-bold text-brand-600">
                    {Math.round(totalMinutes / 60)} hrs
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Days Timeline */}
        <div className="space-y-6">
          {schedule.days.map((day) => {
            const dayQuestions = day.question_ids
              .map((id) => questionsMap.get(id))
              .filter(Boolean) as Question[];

            return (
              <div
                key={day.day}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Day Header Bar */}
                <div className="bg-gradient-to-r from-slate-50 to-white px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-3">
                    <span className="h-8 w-8 rounded-xl bg-brand-600 text-white font-black text-sm flex items-center justify-center shadow-sm">
                      {day.day}
                    </span>
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900">
                        {day.focus}
                      </h3>
                      <div className="text-xs text-slate-400">
                        {dayQuestions.length} practice question(s)
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs font-semibold text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs self-start sm:self-auto">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span>{day.minutes} integer minutes</span>
                  </div>
                </div>

                {/* Day Questions List */}
                <div className="p-6 divide-y divide-slate-100">
                  {dayQuestions.length === 0 ? (
                    <div className="py-4 text-center text-xs text-slate-400">
                      Reinforcement, mental rehearsal, and rest day.
                    </div>
                  ) : (
                    dayQuestions.map((q) => {
                      const isDone = completedQIds.has(q.id);

                      return (
                        <div
                          key={q.id}
                          className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4 group"
                        >
                          <div className="flex items-start space-x-3 flex-1">
                            <button
                              onClick={() => toggleComplete(q.id)}
                              className="mt-0.5 text-slate-400 hover:text-brand-600 transition"
                            >
                              {isDone ? (
                                <CheckSquare className="h-5 w-5 text-emerald-600" />
                              ) : (
                                <Square className="h-5 w-5 text-slate-300 group-hover:text-slate-400" />
                              )}
                            </button>

                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="font-mono text-[11px] font-bold text-slate-400">
                                  {q.id}
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-wider bg-brand-50 text-brand-700 px-2 py-0.5 rounded border border-brand-200">
                                  {q.category}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {"★".repeat(q.difficulty)}
                                </span>
                              </div>

                              <p
                                className={`text-sm font-semibold transition ${
                                  isDone
                                    ? "line-through text-slate-400"
                                    : "text-slate-800"
                                }`}
                              >
                                {q.prompt}
                              </p>

                              <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                                {q.answer_outline}
                              </p>
                            </div>
                          </div>

                          <Link
                            href={`/kit/${kitId}/mock-interview?q=${q.id}`}
                            className="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 transition shrink-0 self-center hidden sm:flex items-center space-x-1"
                          >
                            <Award className="h-3 w-3 text-amber-600" />
                            <span>Mock</span>
                          </Link>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
