"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated, retryState, connectionError, retryConnection } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("prepkit_logging_out") === "true") {
      // User explicitly clicked logout; do not intercept with /login
      return;
    }
    if (!loading && !isAuthenticated && !connectionError) {
      router.replace("/login");
    }
  }, [loading, isAuthenticated, connectionError, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
        <div className="flex flex-col items-center max-w-sm text-center">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20 mb-3">
            <Sparkles className="h-5 w-5" />
          </div>
          <p className="text-base font-bold text-slate-900 tracking-tight">
            PrepKit<span className="text-brand-600">.AI</span>
          </p>

          {retryState?.isRetrying ? (
            <div
              role="status"
              aria-live="polite"
              className="mt-5 p-4 rounded-xl bg-indigo-50/90 border border-indigo-200/90 text-indigo-950 text-xs shadow-xs flex items-start space-x-3 text-left w-full transition-all"
            >
              <Loader2 className="h-4 w-4 text-indigo-600 animate-spin mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-indigo-900 tracking-tight">Connecting to PrepKIT...</p>
                <p className="text-indigo-700/90 mt-0.5 leading-relaxed">
                  The server is starting up. This may take a few moments.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex items-center space-x-2 text-xs text-slate-500 font-medium">
              <Loader2 className="h-4 w-4 text-brand-600 animate-spin" />
              <span>Verifying session...</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (connectionError && !isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md max-w-md w-full text-center">
          <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3 font-bold text-sm">
            !
          </div>
          <p className="text-sm font-bold text-slate-900">We couldn&apos;t connect to the PrepKIT server</p>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            The server may still be booting from sleep or temporarily unavailable. Please try reconnecting.
          </p>
          <div className="mt-5 flex justify-center space-x-3">
            <button
              onClick={() => retryConnection()}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center space-x-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry Connection</span>
            </button>
            <button
              onClick={() => router.push("/login")}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition border border-slate-200"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirection to /login in progress
    return null;
  }

  return <>{children}</>;
}
