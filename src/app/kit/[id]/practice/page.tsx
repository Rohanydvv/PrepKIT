"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { api } from "@/lib/api";
import { Flashcard } from "@/core/types";
import {
  BookOpen,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Trophy,
} from "lucide-react";

export default function PracticeModePage() {
  const params = useParams();
  const router = useRouter();
  const kitId = params?.id as string;

  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [sessionData, setSessionData] = useState<Record<string, { confidence: number }>>({});
  const [stats, setStats] = useState<{
    totalCards: number;
    reviewedCount: number;
    masteredCount: number;
    progressPercent: number;
  }>({ totalCards: 0, reviewedCount: 0, masteredCount: 0, progressPercent: 0 });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionCompleted, setSessionCompleted] = useState(false);

  const loadSession = async () => {
    try {
      const res = await api.practice.get(kitId);
      setFlashcards(res.flashcards);
      setSessionData(res.session.cards || {});
      setStats(res.stats);
      setCurrentIndex(0);
      setIsFlipped(false);
      setSessionCompleted(false);
    } catch (err) {
      alert("Failed to load flashcards: " + (err as Error).message);
      router.push(`/kit/${kitId}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (kitId) loadSession();
  }, [kitId]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (e.key === "1") {
        handleConfidence(1);
      } else if (e.key === "2") {
        handleConfidence(2);
      } else if (e.key === "3") {
        handleConfidence(3);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const handleConfidence = async (confidence: number) => {
    if (flashcards.length === 0) return;
    const currentCard = flashcards[currentIndex];

    try {
      await api.practice.record(kitId, currentCard.id, confidence);
      setSessionData((prev) => ({
        ...prev,
        [currentCard.id]: { confidence },
      }));

      // Next card or complete
      if (currentIndex + 1 < flashcards.length) {
        setCurrentIndex((prev) => prev + 1);
        setIsFlipped(false);
      } else {
        setSessionCompleted(true);
      }
    } catch (err) {
      console.error("Failed to record card review:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar kitId={kitId} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      </div>
    );
  }

  if (flashcards.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar kitId={kitId} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-md bg-white p-8 rounded-2xl border border-slate-200">
            <BookOpen className="h-10 w-10 text-brand-600 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-900">No Flashcards Available</h2>
            <p className="text-sm text-slate-500 mt-1">
              Add flashcards in the Builder to begin practicing.
            </p>
            <Link
              href={`/kit/${kitId}`}
              className="mt-5 inline-block px-4 py-2 bg-brand-600 text-white text-xs font-semibold rounded-xl shadow-sm"
            >
              Back to Builder
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentCard = flashcards[currentIndex];
  const currentConfidence = sessionData[currentCard?.id]?.confidence;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar kitId={kitId} />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col justify-between">
        {/* Header with stats and progress */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <Link
              href={`/kit/${kitId}`}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center space-x-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Builder</span>
            </Link>

            <div className="flex items-center space-x-3 text-xs">
              <span className="font-semibold text-slate-600">
                Mastered:{" "}
                <span className="text-emerald-600 font-bold">
                  {Object.values(sessionData).filter((c) => c.confidence === 3).length} /{" "}
                  {flashcards.length}
                </span>
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6 shadow-2xs">
            <div className="flex justify-between text-xs font-bold text-slate-600 mb-1.5">
              <span>
                Card {currentIndex + 1} of {flashcards.length}
              </span>
              <span>
                {Math.round(((currentIndex + (sessionCompleted ? 1 : 0)) / flashcards.length) * 100)}% Complete
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-brand-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${((currentIndex + (sessionCompleted ? 1 : 0)) / flashcards.length) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Card Section */}
        {!sessionCompleted ? (
          <div className="my-auto py-4">
            {/* 3D Flip Card */}
            <div
              onClick={() => setIsFlipped((prev) => !prev)}
              className="w-full min-h-[320px] bg-white rounded-2xl border border-slate-200/80 shadow-md hover:shadow-lg transition-all cursor-pointer p-8 flex flex-col justify-between select-none relative group"
            >
              {/* Top Card Badge */}
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-slate-400">
                  {currentCard.id} • {currentCard.requirement_ids.join(", ")}
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 flex items-center space-x-1">
                  <RotateCw className="h-3 w-3 text-slate-400 group-hover:rotate-180 transition-transform duration-500" />
                  <span>{isFlipped ? "Answer Side" : "Prompt Side"}</span>
                </span>
              </div>

              {/* Main Prompt or Answer Content */}
              <div className="py-6 text-center">
                {!isFlipped ? (
                  <div>
                    <div className="text-xs uppercase tracking-widest font-bold text-brand-600 mb-2">
                      Prompt / Concept
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-slate-900 leading-relaxed max-w-xl mx-auto">
                      {currentCard.front}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs uppercase tracking-widest font-bold text-emerald-600 mb-2">
                      Answer / Key Points
                    </div>
                    <div className="text-base sm:text-lg font-medium text-slate-800 leading-relaxed max-w-xl mx-auto text-left bg-emerald-50/40 p-5 rounded-xl border border-emerald-100">
                      {currentCard.back}
                    </div>
                  </div>
                )}
              </div>

              {/* Card Bottom Helper */}
              <div className="text-center text-xs text-slate-400">
                Click anywhere or press <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">Space</kbd> to {isFlipped ? "see prompt" : "reveal answer"}
              </div>
            </div>

            {/* Confidence Rating Buttons */}
            <div className="mt-6 grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleConfidence(1)}
                className={`py-3 px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold border flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 transition ${
                  currentConfidence === 1
                    ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                    : "bg-white hover:bg-rose-50 text-rose-700 border-rose-200"
                }`}
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Need Practice (1)</span>
              </button>

              <button
                type="button"
                onClick={() => handleConfidence(2)}
                className={`py-3 px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold border flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 transition ${
                  currentConfidence === 2
                    ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                    : "bg-white hover:bg-amber-50 text-amber-700 border-amber-200"
                }`}
              >
                <RotateCw className="h-4 w-4 shrink-0" />
                <span>Almost Got It (2)</span>
              </button>

              <button
                type="button"
                onClick={() => handleConfidence(3)}
                className={`py-3 px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold border flex flex-col sm:flex-row items-center justify-center space-y-1 sm:space-y-0 sm:space-x-2 transition ${
                  currentConfidence === 3
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                    : "bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Mastered (3)</span>
              </button>
            </div>
          </div>
        ) : (
          /* Session Completed Summary Screen */
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center my-auto shadow-sm">
            <div className="h-16 w-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trophy className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              Practice Session Completed!
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              You reviewed all {flashcards.length} flashcards in this deck.
            </p>

            <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto my-6 text-center">
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                <div className="text-2xl font-black text-emerald-700">
                  {Object.values(sessionData).filter((c) => c.confidence === 3).length}
                </div>
                <div className="text-xs font-semibold text-emerald-800 mt-0.5">
                  Mastered
                </div>
              </div>
              <div className="bg-rose-50 p-4 rounded-xl border border-rose-100">
                <div className="text-2xl font-black text-rose-700">
                  {Object.values(sessionData).filter((c) => c.confidence < 3).length}
                </div>
                <div className="text-xs font-semibold text-rose-800 mt-0.5">
                  Needs Review
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <button
                onClick={loadSession}
                className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center justify-center space-x-1.5"
              >
                <Sparkles className="h-4 w-4" />
                <span>Start Next Spaced Repetition Session</span>
              </button>

              <Link
                href={`/kit/${kitId}`}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
              >
                Return to Builder
              </Link>
            </div>
          </div>
        )}

        {/* Spaced Repetition explanation footer */}
        <div className="text-center text-xs text-slate-400 pt-4">
          Spaced-Repetition System: Future sessions automatically prioritize cards marked with lower confidence.
        </div>
      </main>
    </div>
  );
}
