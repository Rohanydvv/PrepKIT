"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Sparkles,
  BookOpen,
  Calendar,
  Layers,
  LogOut,
  User,
  PlusCircle,
  Award,
} from "lucide-react";

export function Navbar({ kitId }: { kitId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    api.auth
      .me()
      .then((res) => setUserEmail(res.user.email))
      .catch(() => setUserEmail(null));
  }, []);

  const handleLogout = async () => {
    try {
      await api.auth.logout();
      setUserEmail(null);
      router.push("/login");
    } catch {
      router.push("/login");
    }
  };

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-6">
            <Link href="/" className="flex items-center space-x-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <span className="font-bold text-lg text-slate-900 tracking-tight">
                  PrepKit<span className="text-brand-600">.AI</span>
                </span>
                <span className="hidden sm:inline-block ml-2 text-[10px] uppercase font-bold tracking-widest bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded border border-brand-200">
                  Trao FS-AI
                </span>
              </div>
            </Link>

            {kitId && (
              <div className="hidden md:flex items-center space-x-1 pl-4 border-l border-slate-200 text-sm font-medium">
                <Link
                  href={`/kit/${kitId}`}
                  className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                    pathname === `/kit/${kitId}`
                      ? "bg-brand-50 text-brand-700 font-semibold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <Layers className="h-4 w-4" />
                  <span>Builder</span>
                </Link>

                <Link
                  href={`/kit/${kitId}/practice`}
                  className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                    pathname?.includes("/practice")
                      ? "bg-brand-50 text-brand-700 font-semibold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Flashcards</span>
                </Link>

                <Link
                  href={`/kit/${kitId}/schedule`}
                  className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                    pathname?.includes("/schedule")
                      ? "bg-brand-50 text-brand-700 font-semibold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <Calendar className="h-4 w-4" />
                  <span>Schedule</span>
                </Link>

                <Link
                  href={`/kit/${kitId}/mock-interview`}
                  className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                    pathname?.includes("/mock-interview")
                      ? "bg-brand-50 text-brand-700 font-semibold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <Award className="h-4 w-4 text-amber-500" />
                  <span>AI Mock Coach</span>
                </Link>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href="/generate"
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg shadow-sm transition"
            >
              <PlusCircle className="h-4 w-4" />
              <span className="hidden sm:inline">New Kit</span>
            </Link>

            {userEmail ? (
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
                <div className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-600 bg-slate-100 py-1 px-2.5 rounded-full">
                  <User className="h-3 w-3 text-slate-500" />
                  <span className="max-w-[130px] truncate">{userEmail}</span>
                </div>
                <button
                  onClick={handleLogout}
                  title="Log out"
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="text-sm font-medium text-brand-600 hover:text-brand-800 px-3 py-1.5"
              >
                Log In
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
