"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RetryState, FetchJsonOptions, hasStoredSession } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading, login, signup, demoLogin } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const [lastAction, setLastAction] = useState<"submit" | "demo" | null>(null);

  // Requirement 13 & Flow 8: If already authenticated, redirect to dashboard immediately
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/");
    }
  }, [authLoading, isAuthenticated, router]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return;

    setError(null);
    setRetryState(null);
    setLastAction("submit");

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      const opts: FetchJsonOptions = {
        onRetry: (state) => {
          setRetryState(state.isRetrying ? state : null);
        },
      };

      if (isRegister) {
        await signup(cleanEmail, password, opts);
      } else {
        await login(cleanEmail, password, opts);
      }
      setRetryState(null);
      router.push("/");
    } catch (err: any) {
      setRetryState(null);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    if (loading) return;

    setError(null);
    setRetryState(null);
    setLastAction("demo");
    setLoading(true);

    try {
      await demoLogin({
        onRetry: (state) => {
          setRetryState(state.isRetrying ? state : null);
        },
      });
      setRetryState(null);
      router.push("/");
    } catch (err: any) {
      setRetryState(null);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const isConnectionError =
    Boolean(error) &&
    (error!.includes("couldn't connect") ||
      error!.includes("temporarily unavailable") ||
      error!.includes("waking up") ||
      error!.includes("Failed to connect") ||
      error!.includes("Network connection failed"));

  // Prevent login form flicker if stored session is currently validating
  if (authLoading && hasStoredSession()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <div className="flex flex-col items-center">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 items-center justify-center text-white shadow-lg shadow-brand-500/25 mb-3">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-500 font-medium mt-3">
            <Loader2 className="h-4 w-4 text-brand-600 animate-spin" />
            <span>Checking session...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-slate-50 via-slate-100 to-indigo-50/30">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 items-center justify-center text-white shadow-lg shadow-brand-500/25 mb-3">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            PrepKit<span className="text-brand-600">.AI</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Personalised interview kits built from live site research
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200/80 p-6 sm:p-8">
          {/* Instant Demo Access Button */}
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full mb-6 py-3 px-4 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60 border border-emerald-300/80 rounded-xl text-emerald-900 text-sm font-semibold flex items-center justify-center space-x-2 transition shadow-sm"
          >
            {loading && lastAction === "demo" ? (
              <span className="flex items-center space-x-2 text-emerald-800">
                <Loader2 className="h-4 w-4 text-emerald-600 animate-spin" />
                <span>
                  {retryState?.isRetrying
                    ? "Connecting to PrepKIT..."
                    : "Preparing demo access..."}
                </span>
              </span>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>1-Click Quick Demo Access</span>
                <ArrowRight className="h-4 w-4 text-emerald-600" />
              </>
            )}
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400 font-medium">Or enter credentials</span>
            </div>
          </div>

          <div className="flex border-b border-slate-200 mb-6">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setIsRegister(false);
                setError(null);
                setRetryState(null);
              }}
              className={`flex-1 pb-3 text-sm font-semibold border-b-2 text-center transition ${
                !isRegister
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setIsRegister(true);
                setError(null);
                setRetryState(null);
              }}
              className={`flex-1 pb-3 text-sm font-semibold border-b-2 text-center transition ${
                isRegister
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Non-intrusive Connecting / Server Startup Notice */}
          {retryState?.isRetrying && (
            <div
              role="status"
              aria-live="polite"
              className="mb-5 p-3.5 rounded-xl bg-indigo-50/90 border border-indigo-200/90 text-indigo-950 text-xs shadow-xs flex items-start space-x-3 transition-all"
            >
              <div className="mt-0.5 flex-shrink-0">
                <Loader2 className="h-4 w-4 text-indigo-600 animate-spin" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-indigo-900 tracking-tight">
                  Connecting to PrepKIT...
                </p>
                <p className="text-indigo-700/90 mt-0.5 leading-relaxed">
                  The server is starting up. This may take a few moments.
                </p>
              </div>
            </div>
          )}

          {/* Error Banner when retries fail or application error occurs */}
          {error && !retryState?.isRetrying && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium space-y-2"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-0.5 flex-1 pr-2">
                  {isConnectionError ? (
                    <>
                      <p className="font-semibold text-rose-900">
                        We couldn&apos;t connect to the PrepKIT server.
                      </p>
                      <p className="text-rose-700 leading-relaxed">
                        Please try again in a moment.
                      </p>
                    </>
                  ) : (
                    <span>{error}</span>
                  )}
                </div>

                {/* Prompt to switch to Sign In when duplicate account is detected */}
                {isRegister && error.toLowerCase().includes("already exists") && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegister(false);
                      setError(null);
                    }}
                    className="ml-2 font-semibold text-brand-700 hover:text-brand-900 underline whitespace-nowrap"
                  >
                    Sign In
                  </button>
                )}

                {/* Honest Retry action when server connection failed */}
                {isConnectionError && (
                  <button
                    type="button"
                    onClick={() => {
                      if (lastAction === "demo") {
                        handleDemoLogin();
                      } else {
                        handleSubmit();
                      }
                    }}
                    className="ml-2 px-2.5 py-1 bg-white hover:bg-rose-100/70 border border-rose-300 text-rose-900 font-semibold rounded-lg text-xs shadow-xs transition flex items-center space-x-1 whitespace-nowrap"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                disabled={loading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-md shadow-brand-600/20 transition flex items-center justify-center space-x-1.5"
            >
              {loading && lastAction === "submit" ? (
                <span className="flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>
                    {retryState?.isRetrying
                      ? "Connecting to PrepKIT..."
                      : "Processing..."}
                  </span>
                </span>
              ) : (
                <>
                  <span>{isRegister ? "Create Account" : "Sign In"}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-400 flex items-center justify-center space-x-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span>Secure session authentication • Encrypted passwords</span>
          </div>
        </div>
      </div>
    </div>
  );
}
