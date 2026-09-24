"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { StoredKitRecord } from "@/core/types";
import {
  Sparkles,
  Plus,
  Trash2,
  ArrowRight,
  UploadCloud,
  AlertCircle,
  LogOut,
  Layers,
  Loader2,
} from "lucide-react";

export function DashboardView() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [kits, setKits] = useState<StoredKitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchFileContent, setBatchFileContent] = useState("");
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const loadKits = async () => {
    try {
      const res = await api.kits.list();
      setKits(res.kits);
    } catch (err: any) {
      if (err?.status === 401) {
        await logout();
        router.push("/");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKits();
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      router.push("/");
    } catch {
      router.push("/");
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this prep kit?")) return;

    try {
      await api.kits.delete(id);
      setKits((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleBatchSubmit = async () => {
    setBatchError(null);
    if (!batchFileContent.trim()) {
      setBatchError("Please paste or upload JSON batch cases.");
      return;
    }

    try {
      const parsed = JSON.parse(batchFileContent);
      if (!Array.isArray(parsed)) {
        throw new Error("Batch data must be a JSON array of cases.");
      }

      setBatchProcessing(true);
      for (const item of parsed) {
        if (item.jd && item.company_url) {
          await api.kits.generate(item.jd, item.company_url, item.days || 5);
        }
      }
      setShowBatchModal(false);
      setBatchFileContent("");
      await loadKits();
    } catch (err) {
      setBatchError((err as Error).message);
    } finally {
      setBatchProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setBatchFileContent(String(event.target?.result || ""));
    };
    reader.readAsText(file);
  };

  // Metrics
  const totalQuestions = kits.reduce(
    (acc, k) => acc + (k.kit.questions?.length || 0),
    0
  );
  const totalFlashcards = kits.reduce(
    (acc, k) => acc + (k.kit.flashcards?.length || 0),
    0
  );
  const avgCoverage =
    kits.length > 0
      ? Math.round(
          kits.reduce((acc, k) => {
            const totalReqs = k.kit.role?.requirements?.length || 1;
            const uncovered =
              k.kit.coverage?.uncovered_requirement_ids?.length || 0;
            return (
              acc + Math.round(((totalReqs - uncovered) / totalReqs) * 100)
            );
          }, 0) / kits.length
        )
      : 0;

  const getKitCoverage = (item: StoredKitRecord) => {
    const totalReqs = item.kit.role?.requirements?.length || 1;
    const uncovered = item.kit.coverage?.uncovered_requirement_ids?.length || 0;
    return Math.min(
      100,
      Math.max(0, Math.round(((totalReqs - uncovered) / totalReqs) * 100))
    );
  };

  // Greeting
  const hour = new Date().getHours();
  const timeGreeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const candidateName = user?.email
    ? user.email.split("@")[0].split(/[._-]/)[0]
    : "Candidate";
  const displayName =
    candidateName.charAt(0).toUpperCase() + candidateName.slice(1);

  const featuredKit = kits[0];
  const otherKits = kits.slice(1);
  const featuredCoverage = featuredKit ? getKitCoverage(featuredKit) : 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Mobile Top Header (lg:hidden) */}
      <header className="lg:hidden bg-white border-b border-slate-200/80 px-4 py-3 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="h-8 w-8 rounded-lg bg-brand-600 text-white flex items-center justify-center shadow-xs">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-bold text-base text-slate-900 tracking-tight">
            PrepKIT<span className="text-brand-600">.AI</span>
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <Link
            href="/generate"
            className="inline-flex items-center space-x-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg shadow-xs transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Kit</span>
          </Link>
          <button
            onClick={handleLogout}
            title="Log out"
            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Quiet, Compact Sidebar (lg:flex) */}
      <aside className="hidden lg:flex w-60 shrink-0 bg-white border-r border-slate-200/80 min-h-screen flex-col justify-between p-5 sticky top-0 h-screen">
        <div className="space-y-6">
          {/* Brand Mark */}
          <div className="flex items-center space-x-2.5 px-2 pt-1">
            <div className="h-8 w-8 rounded-lg bg-brand-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-bold text-base text-slate-900 tracking-tight">
              PrepKIT<span className="text-brand-600">.AI</span>
            </span>
          </div>

          {/* Quiet Navigation */}
          <nav className="space-y-1">
            <div className="px-3 py-2 text-xs font-semibold text-brand-700 bg-brand-50/80 rounded-xl flex items-center space-x-2.5">
              <Layers className="h-4 w-4 text-brand-600" />
              <span>Interview Kits</span>
            </div>

            <Link
              href="/generate"
              className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl flex items-center space-x-2.5 transition-colors"
            >
              <Plus className="h-4 w-4 text-slate-400" />
              <span>Create Kit</span>
            </Link>

            <button
              type="button"
              onClick={() => setShowBatchModal(true)}
              className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl flex items-center space-x-2.5 transition-colors"
            >
              <UploadCloud className="h-4 w-4 text-slate-400" />
              <span>Batch Upload</span>
            </button>
          </nav>
        </div>

        {/* User Account / Logout */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between px-1">
          <div className="min-w-0 pr-2">
            <p className="text-xs font-semibold text-slate-800 truncate">
              {user?.email || "Candidate"}
            </p>
            <p className="text-[11px] text-slate-400">Authenticated</p>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 py-8 sm:py-10 px-5 sm:px-8 lg:px-12">
        <div className="max-w-5xl mx-auto space-y-10">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                {timeGreeting}, {displayName}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Prepare with structured research, interview questions, and study plans.
              </p>
            </div>

            <div className="flex items-center space-x-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowBatchModal(true)}
                className="hidden sm:inline-flex items-center space-x-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-xs transition-colors"
              >
                <UploadCloud className="h-3.5 w-3.5 text-slate-400" />
                <span>Batch</span>
              </button>

              <Link
                href="/generate"
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-sm hover:shadow-brand-sm transition-all duration-150"
              >
                <Plus className="h-4 w-4" />
                <span>Create Interview Kit</span>
              </Link>
            </div>
          </div>

          {/* Loading State */}
          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="h-6 w-6 text-brand-600 animate-spin mx-auto" />
              <p className="text-xs text-slate-400 mt-3 font-medium">
                Loading your interview kits...
              </p>
            </div>
          ) : kits.length === 0 ? (
            /* Refined Centered Empty State */
            <div className="py-20 px-4 text-center">
              <div className="max-w-sm mx-auto space-y-3">
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  No interview kits yet
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                  Generate your first personalized interview kit from a job description and company URL.
                </p>
                <div className="pt-2">
                  <Link
                    href="/generate"
                    className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-sm hover:shadow-brand-sm transition-all duration-150"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create Interview Kit</span>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Overview Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
                  <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    {kits.length}
                  </div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mt-1">
                    Active Kits
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
                  <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    {totalQuestions}
                  </div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mt-1">
                    Questions
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
                  <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    {avgCoverage}%
                  </div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mt-1">
                    Coverage
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs">
                  <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    {totalFlashcards}
                  </div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mt-1">
                    Practice
                  </div>
                </div>
              </div>

              {/* Continue Preparing — Featured Kit */}
              {featuredKit && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Continue Preparing
                    </h2>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-7 shadow-sm hover:shadow-md transition-all duration-150">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                      <div className="space-y-1 min-w-0 flex-1">
                        <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider">
                          {featuredKit.kit.source.company || "Target Company"}
                        </p>
                        <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight truncate">
                          {featuredKit.kit.role.title}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium pt-0.5">
                          {featuredCoverage}% coverage
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          onClick={(e) => handleDelete(featuredKit.id, e)}
                          title="Delete kit"
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>

                        <Link
                          href={`/kit/${featuredKit.id}`}
                          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs hover:shadow-brand-sm transition-all duration-150"
                        >
                          <span>Continue</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Your Kits Grid */}
              {otherKits.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Your Kits
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {otherKits.map((item) => {
                      const coverage = getKitCoverage(item);
                      return (
                        <div
                          key={item.id}
                          className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:shadow-sm transition-all duration-150 flex flex-col justify-between"
                        >
                          <div className="space-y-1">
                            <div className="flex items-start justify-between">
                              <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider truncate">
                                {item.kit.source.company || "Target Company"}
                              </p>
                              <button
                                onClick={(e) => handleDelete(item.id, e)}
                                title="Delete kit"
                                className="text-slate-300 hover:text-rose-600 p-1 rounded-lg transition-colors ml-2 shrink-0"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <h3 className="text-base font-bold text-slate-900 truncate">
                              {item.kit.role.title}
                            </h3>
                          </div>

                          <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-xs text-slate-500 font-medium">
                              {coverage}% coverage
                            </span>
                            <Link
                              href={`/kit/${item.id}`}
                              className="inline-flex items-center space-x-1 text-xs font-semibold text-brand-600 hover:text-brand-800 transition-colors"
                            >
                              <span>Open</span>
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Batch Upload Modal */}
        {showBatchModal && (
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
                  <UploadCloud className="h-4 w-4 text-brand-600" />
                  <span>Batch Prepare Roles</span>
                </div>
                <button
                  onClick={() => setShowBatchModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-semibold p-1"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                Upload or paste a JSON array of job descriptions and company URLs to generate multiple preparation kits.
              </p>

              {batchError && (
                <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center space-x-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{batchError}</span>
                </div>
              )}

              <div className="mt-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Upload Cases JSON File
                </label>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
                />
              </div>

              <div className="mt-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Or Paste JSON Array
                </label>
                <textarea
                  rows={5}
                  value={batchFileContent}
                  onChange={(e) => setBatchFileContent(e.target.value)}
                  placeholder={`[\n  {\n    "jd": "Job description text...",\n    "company_url": "https://company.com",\n    "days": 5\n  }\n]`}
                  className="w-full font-mono text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-800"
                />
              </div>

              <div className="mt-5 flex justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={batchProcessing}
                  onClick={handleBatchSubmit}
                  className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition flex items-center space-x-1.5"
                >
                  {batchProcessing ? (
                    <span className="flex items-center space-x-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Processing...</span>
                    </span>
                  ) : (
                    <span>Start Batch</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
