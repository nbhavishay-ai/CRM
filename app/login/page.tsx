'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Shield,
  Smartphone,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstallPwa, setCanInstallPwa] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstallPwa(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setCanInstallPwa(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email and password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }

      setIsSuccess(true);

      const role = data.user?.role;
      setTimeout(() => {
        if (role === 'ADMIN') {
          router.push('/dashboard/admin/dashboard');
        } else if (role === 'TEAM_LEAD') {
          router.push('/dashboard/team-lead/dashboard');
        } else if (role === 'HR') {
          router.push('/dashboard/hr/dashboard');
        } else {
          router.push('/dashboard/executive/dashboard');
        }
        router.refresh();
      }, 350);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  return (
    <main
      className="min-h-[100dvh] flex flex-col justify-between bg-[#0B0C0D] text-[#F4F2EC] relative overflow-x-hidden font-sans selection:bg-[#B69A63]/30 selection:text-[#F4F2EC]"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Ambient background glows */}
      <div
        className="absolute top-[-10%] left-[-10%] w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] rounded-full bg-[#B69A63]/10 blur-[100px] sm:blur-[130px] pointer-events-none animate-liquid-orb-1"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-[-10%] right-[-10%] w-[400px] sm:w-[550px] h-[400px] sm:h-[550px] rounded-full bg-[#D2BE91]/5 blur-[120px] sm:blur-[150px] pointer-events-none animate-liquid-orb-2"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none opacity-60"
        aria-hidden="true"
      />

      {/* Top Brand Navbar */}
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <img
            src="/logo.png"
            alt="ORVION Logo"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-cover border border-[#B69A63]/40 shadow-lg shadow-black/40 shrink-0"
          />
          <div>
            <span className="text-xs sm:text-sm font-black tracking-[0.2em] sm:tracking-[0.25em] text-[#F4F2EC] uppercase block leading-tight">
              ORVION
            </span>
            <span className="block text-[8px] sm:text-[9px] font-mono tracking-widest text-[#B69A63] uppercase leading-tight">
              Enterprise CRM
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canInstallPwa && (
            <button
              onClick={handleInstallPwa}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#B69A63]/20 hover:bg-[#B69A63]/30 border border-[#B69A63]/50 text-[#D2BE91] text-[10px] sm:text-[11px] font-bold tracking-wide transition cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Install App</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-[#17191A] border border-[#26282B] text-[10px] sm:text-[11px] font-mono text-[#AEB1AC]">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden xs:inline">ONLINE ·</span>
            <span>v2.4</span>
          </div>
        </div>
      </header>

      {/* Main Login Content */}
      <section className="w-full max-w-md mx-auto px-4 py-4 sm:py-8 relative z-10 my-auto">
        <div className="rounded-3xl bg-[#111314]/90 backdrop-blur-2xl border border-[#26282B] p-5 sm:p-8 shadow-2xl shadow-black/70 relative">
          {/* Top subtle highlight */}
          <div className="absolute top-0 left-8 right-8 h-[1px] bg-gradient-to-r from-transparent via-[#B69A63]/60 to-transparent" />

          {/* Heading */}
          <div className="text-center mb-6 sm:mb-7">
            <div className="inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#17191A] border border-[#B69A63]/30 mb-2.5 shadow-inner">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-[#D2BE91]" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-[#F4F2EC] tracking-tight">
              Sign in to ORVION
            </h1>
            <p className="text-xs text-[#AEB1AC] mt-1 leading-relaxed">
              Enter corporate credentials to access your workspace
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-200 text-xs font-medium flex items-center gap-2.5 animate-page-enter">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success state */}
          {isSuccess && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-200 text-xs font-medium flex items-center gap-2.5 animate-page-enter">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Authentication verified. Opening workspace...</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-3.5 sm:space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-[#D2BE91] uppercase tracking-wider mb-1.5"
              >
                Corporate Email
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3.5 w-4 h-4 text-[#727570] pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@orvion.com"
                  autoComplete="email"
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#0B0C0D] border border-[#26282B] text-[#F4F2EC] placeholder:text-[#525450] text-base sm:text-sm focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63] transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-[#D2BE91] uppercase tracking-wider mb-1.5"
              >
                Password
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 w-4 h-4 text-[#727570] pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  className="w-full h-11 pl-10 pr-11 rounded-xl bg-[#0B0C0D] border border-[#26282B] text-[#F4F2EC] placeholder:text-[#525450] text-base sm:text-sm focus:outline-none focus:border-[#B69A63] focus:ring-1 focus:ring-[#B69A63] transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 p-1.5 rounded-lg text-[#727570] hover:text-[#D2BE91] transition min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || isSuccess}
              className="w-full h-11 sm:h-12 mt-2 rounded-xl bg-gradient-to-r from-[#B69A63] to-[#C6AD7A] hover:from-[#C6AD7A] hover:to-[#D2BE91] text-[#0B0C0D] font-bold text-xs uppercase tracking-widest shadow-lg shadow-[#B69A63]/20 flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-60 cursor-pointer min-h-[44px]"
            >
              {loading || isSuccess ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-[#0B0C0D] border-t-transparent rounded-full animate-spin" />
                  <span>Verifying...</span>
                </span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 text-center text-xs text-[#727570] flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3 border-t border-[#1E2021] relative z-10">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#B69A63]" />
          <span className="text-[11px] sm:text-xs">256-Bit SSL · Role-Based Isolation</span>
        </div>
        <p className="font-mono text-[9px] sm:text-[10px]">
          © {new Date().getFullYear()} ORVION REALTY GROUP.
        </p>
      </footer>
    </main>
  );
}
