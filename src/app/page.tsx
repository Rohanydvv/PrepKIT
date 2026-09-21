"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { StoredKitRecord } from "@/core/types";
import { Navbar } from "@/components/Navbar";
import {
  Sparkles,
  PlusCircle,
  BookOpen,
  Calendar,
  Layers,
  Trash2,
  Building2,
  Clock,
  ArrowRight,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Award,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
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
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKits();
  }, []);

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

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              My Interview Preparation Kits
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Personalised, research-backed preparation materials tailored for your upcoming interviews.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowBatchModal(true)}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 shadow-sm transition"
            >
              <UploadCloud className="h-4 w-4 text-slate-500" />
              <span>Batch Upload</span>
            </button>

            <Link
              href="/generate"
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-brand-600/20 transition"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Generate New Kit</span>
            </Link>
          </div>
        </div>

        {/* Content Section */}
        {loading ? (
          <div className="py-24 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
            <p className="text-sm text-slate-400 mt-3">Loading your preparation kits...</p>
          </div>
        ) : kits.length === 0 ? (
          <div className="mt-12 text-center max-w-lg mx-auto bg-white p-8 rounded-2xl border border-dashed border-slate-300 shadow-sm">
            <div className="h-14 w-14 bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Sparkles className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No Interview Kits Yet</h3>
            <p className="text-sm text-slate-500 mt-2">
              Paste in any job description and company website URL to generate your first personalised interview kit with crawled research, questions, and a study schedule.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
              <Link
                href="/generate"
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold shadow-sm transition"
              >
                Create Your First Kit
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {kits.map((item) => {
              const kit = item.kit;
              const formattedDate = new Date(item.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              });

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition flex flex-col justify-between overflow-hidden group"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-sm shrink-0">
                        <Building2 className="h-5 w-5 text-brand-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-brand-600 uppercase tracking-wider">
                          {kit.source.company || "Target Company"}
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 truncate mt-0.5">
                          {kit.role.title}
                        </h3>
                      </div>
                      <button
                        onClick={(e) => handleDelete(item.id, e)}
                        title="Delete kit"
                        className="text-slate-300 hover:text-rose-600 p-1 rounded transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-2 mt-3">
                      {kit.company_brief.summary}
                    </p>

                    {/* Stats Pill Row */}
                    <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100 text-center">
                      <div className="bg-slate-50 p-2 rounded-lg">
                        <div className="text-xs text-slate-400 font-medium">Questions</div>
                        <div className="text-sm font-bold text-slate-800">
                          {kit.questions.length}
                        </div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg">
                        <div className="text-xs text-slate-400 font-medium">Flashcards</div>
                        <div className="text-sm font-bold text-slate-800">
                          {kit.flashcards.length}
                        </div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg">
                        <div className="text-xs text-slate-400 font-medium">Timeline</div>
                        <div className="text-sm font-bold text-slate-800">
                          {kit.schedule.days_available}d
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formattedDate}</span>
                    </div>

                    <Link
                      href={`/kit/${item.id}`}
                      className="text-xs font-bold text-brand-600 hover:text-brand-800 flex items-center space-x-1 transition"
                    >
                      <span>Open Prep Kit</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Batch Upload Modal (Section 2) */}
        {showBatchModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2 text-slate-900 font-bold">
                  <UploadCloud className="h-5 w-5 text-brand-600" />
                  <span>Batch Prepare Multiple Roles</span>
                </div>
                <button
                  onClick={() => setShowBatchModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-500 mt-3">
                Upload or paste an array of job descriptions and company URLs. The application will crawl and generate kits for all roles concurrently.
              </p>

              {batchError && (
                <div className="mt-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center space-x-2">
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
                  rows={6}
                  value={batchFileContent}
                  onChange={(e) => setBatchFileContent(e.target.value)}
                  placeholder={`[\n  {\n    "jd": "Job description text...",\n    "company_url": "https://company.com",\n    "days": 5\n  }\n]`}
                  className="w-full font-mono text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={batchProcessing}
                  onClick={handleBatchSubmit}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center space-x-1.5"
                >
                  {batchProcessing ? (
                    <span>Processing Batch...</span>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Start Batch Generation</span>
                    </>
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
