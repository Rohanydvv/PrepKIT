"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RetryState, FetchJsonOptions, hasStoredSession } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Loader2,
  RefreshCw,
  AlertCircle,
  Lock,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, loading: authLoading, login, signup, demoLogin } = useAuth();
  const mode = searchParams.get("mode");
  const isSignupParam = mode === "signup" || mode === "register" || searchParams.get("signup") === "true";
  const [isRegister, setIsRegister] = useState(isSignupParam);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const [lastAction, setLastAction] = useState<"submit" | "demo" | null>(null);

  useEffect(() => {
    if (isSignupParam) {
      setIsRegister(true);
    }
  }, [isSignupParam]);

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
          <div className="inline-flex h-11 w-11 rounded-xl bg-brand-600 items-center justify-center text-white shadow-sm shadow-brand-600/30 ring-1 ring-brand-700/20 mb-3">
            <Sparkles className="h-5 w-5" />
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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 sm:py-12 bg-slate-50 relative overflow-hidden selection:bg-brand-500/15 selection:text-brand-900">
      {/* Subtle ambient light and grid decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(45rem_25rem_at_top,theme(colors.indigo.100/40),transparent)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000005_1px,transparent_1px),linear-gradient(to_bottom,#00000005_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="w-full max-w-[420px] relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-7">
          <div className="inline-flex h-11 w-11 rounded-xl bg-brand-600 items-center justify-center text-white shadow-sm shadow-brand-600/30 ring-1 ring-brand-700/20 mb-3.5 transition-transform hover:scale-105 duration-150">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            PrepKIT<span className="text-brand-600">.AI</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1.5 font-normal">
            Personalized interview kits built from live site research
          </p>
        </div>

        {/* Polished Auth Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-8">
          {/* Instant Demo Access Button */}
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={loading}
            className="group w-full py-2.5 px-4 bg-emerald-50/70 hover:bg-emerald-50 active:bg-emerald-100/70 disabled:opacity-60 border border-emerald-200/80 hover:border-emerald-300 rounded-xl text-emerald-900 text-xs font-semibold flex items-center justify-between transition-all duration-150 shadow-xs mb-5"
          >
            {loading && lastAction === "demo" ? (
              <span className="flex items-center justify-center space-x-2 w-full text-emerald-800 py-0.5">
                <Loader2 className="h-4 w-4 text-emerald-600 animate-spin" />
                <span>
                  {retryState?.isRetrying
                    ? "Connecting to PrepKIT..."
                    : "Preparing demo access..."}
                </span>
              </span>
            ) : (
              <>
                <div className="flex items-center space-x-2">
                  <div className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </div>
                  <span className="tracking-tight">1-Click Quick Demo Access</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>

          {/* Divider */}
          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
              <span className="bg-white px-2.5 text-slate-400 font-medium">Or continue with credentials</span>
            </div>
          </div>

          {/* Refined Segmented Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-100/80 rounded-xl border border-slate-200/60 mb-5">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setIsRegister(false);
                setError(null);
                setRetryState(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                !isRegister
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-700"
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
              className={`py-2 text-xs font-semibold rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                isRegister
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-700"
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
              className="mb-4 p-3 rounded-xl bg-indigo-50/80 border border-indigo-200/70 text-indigo-950 text-xs shadow-xs flex items-start space-x-2.5 transition-all"
            >
              <Loader2 className="h-4 w-4 text-indigo-600 animate-spin mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-indigo-950 tracking-tight">
                  Connecting to PrepKIT...
                </p>
                <p className="text-indigo-700/90 mt-0.5 leading-relaxed">
                  The server is starting up. This may take a few moments.
                </p>
              </div>
            </div>
          )}

          {/* Integrated Error State */}
          {error && !retryState?.isRetrying && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-xl bg-rose-50/80 border border-rose-200/70 text-rose-900 text-xs flex items-start space-x-2.5 transition-all"
            >
              <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                {isConnectionError ? (
                  <>
                    <p className="font-semibold text-rose-950">
                      We couldn&apos;t connect to the PrepKIT server.
                    </p>
                    <p className="text-rose-700 leading-relaxed">
                      The service may still be waking up. Please try again in a moment.
                    </p>
                  </>
                ) : (
                  <p className="font-medium text-rose-900 leading-relaxed">{error}</p>
                )}

                {/* Prompt to switch to Sign In when duplicate account is detected */}
                {isRegister && error.toLowerCase().includes("already exists") && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegister(false);
                      setError(null);
                    }}
                    className="mt-1 font-semibold text-brand-700 hover:text-brand-900 underline block"
                  >
                    Already registered? Sign In
                  </button>
                )}

                {/* Honest Retry action when server connection failed */}
                {isConnectionError && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (lastAction === "demo") {
                          handleDemoLogin();
                        } else {
                          handleSubmit();
                        }
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-rose-50 border border-rose-200 text-rose-900 font-semibold rounded-lg text-xs shadow-xs transition flex items-center space-x-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Retry</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                disabled={loading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="h-11 w-full px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-150 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete={isRegister ? "new-password" : "current-password"}
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 w-full px-3.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-150 disabled:bg-slate-50 disabled:text-slate-400"
              />
              {isRegister && (
                <p className="text-[11px] text-slate-400 mt-1">Minimum 6 characters</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-11 w-full mt-2 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-sm hover:shadow-brand-sm transition-all duration-150 flex items-center justify-center space-x-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              {loading && lastAction === "submit" ? (
                <span className="flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
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

          {/* Security Footer */}
          <div className="mt-6 pt-4 border-t border-slate-100 text-center text-[11px] text-slate-400 flex items-center justify-center space-x-1.5">
            <Lock className="h-3.5 w-3.5 text-slate-400" />
            <span>Secure session authentication • Encrypted passwords</span>
          </div>
        </div>

        {/* Page Footer */}
        <div className="text-center mt-6 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} PrepKIT.AI • Technical Interview Preparation</p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
