'use client';

import React, { useEffect, useState } from 'react';
import { Download, X, Smartphone, Sparkles } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaRegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [showPushBanner, setShowPushBanner] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then(async (registration) => {
            console.log('ORVION Service Worker registered:', registration.scope);
            const auth = await fetch('/api/auth/me').catch(() => null);
            if (auth?.ok && 'Notification' in window && Notification.permission === 'default') {
              setShowPushBanner(true);
            }
            if (auth?.ok && 'Notification' in window && Notification.permission === 'granted') {
              await subscribeToPush(registration);
            }
          })
          .catch((error) => {
            console.warn('ORVION Service Worker registration:', error);
          });
      });
    }

    // 2. Check iOS Safari
    if (typeof window !== 'undefined') {
      const userAgent = window.navigator.userAgent.toLowerCase();
      const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;

      setIsIos(isIosDevice);

      // 3. Listen for Android/Desktop PWA install prompt
      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
        // Do not show if already in standalone mode or dismissed
        if (!isStandalone) {
          const dismissed = localStorage.getItem('orvion_pwa_dismissed');
          if (!dismissed) {
            setShowInstallBanner(true);
          }
        }
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }
  }, []);

  const subscribeToPush = async (registration: ServiceWorkerRegistration) => {
    if (!('PushManager' in window) || !('Notification' in window)) return;
    setPushBusy(true);
    try {
      const keyResponse = await fetch('/api/push/subscribe');
      const { publicKey } = await keyResponse.json();
      if (!publicKey) return;
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if (permission !== 'granted') return;
      const applicationServerKey = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      setShowPushBanner(false);
    } catch (error) {
      console.warn('ORVION push subscription:', error);
    } finally {
      setPushBusy(false);
    }
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setShowInstallBanner(false);
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosGuide(true);
    }
  };

  const handleDismiss = () => {
    setShowInstallBanner(false);
    setShowIosGuide(false);
    try {
      localStorage.setItem('orvion_pwa_dismissed', 'true');
    } catch {}
  };

  if (!showInstallBanner && !showIosGuide && !showPushBanner) return null;

  return (
    <>
      {/* PWA Floating Mobile Install Banner */}
      {showInstallBanner && (
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="p-3.5 rounded-2xl bg-[#111314]/95 backdrop-blur-xl border border-[#B69A63]/50 text-[#F4F2EC] shadow-2xl shadow-black/80 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1E2021] to-[#111314] border border-[#B69A63]/50 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-[#D2BE91]" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#F4F2EC] flex items-center gap-1.5">
                  <span>Install ORVION CRM</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#B69A63]/20 text-[#D2BE91]">
                    PWA
                  </span>
                </h4>
                <p className="text-[11px] text-[#AEB1AC]">
                  Fast 0ms mobile experience & offline access
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleInstallClick}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#B69A63] to-[#C6AD7A] text-[#0B0C0D] text-xs font-bold uppercase tracking-wider flex items-center gap-1 shadow-md hover:brightness-110 active:scale-95 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install</span>
              </button>
              <button
                onClick={handleDismiss}
                className="p-1.5 rounded-lg text-[#727570] hover:text-[#F4F2EC] hover:bg-white/10 transition cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Add to Home Screen Instructions Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#111314] border border-[#B69A63]/40 p-6 text-[#F4F2EC] shadow-2xl animate-page-enter">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#D2BE91]" />
                <h3 className="text-sm font-bold">Install on iPhone / iPad</h3>
              </div>
              <button onClick={() => setShowIosGuide(false)} className="text-[#727570] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <ol className="space-y-3 text-xs text-[#AEB1AC]">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#1E2021] border border-[#B69A63]/30 text-[#D2BE91] flex items-center justify-center font-bold text-[10px] shrink-0">
                  1
                </span>
                <span>
                  Tap the <strong className="text-white">Share</strong> button at the bottom of Safari (box with arrow).
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#1E2021] border border-[#B69A63]/30 text-[#D2BE91] flex items-center justify-center font-bold text-[10px] shrink-0">
                  2
                </span>
                <span>
                  Scroll down and select <strong className="text-white">&ldquo;Add to Home Screen&rdquo;</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#1E2021] border border-[#B69A63]/30 text-[#D2BE91] flex items-center justify-center font-bold text-[10px] shrink-0">
                  3
                </span>
                <span>
                  Tap <strong className="text-white">Add</strong> in the top right to launch ORVION in full-screen standalone mode.
                </span>
              </li>
            </ol>
            <button
              onClick={() => setShowIosGuide(false)}
              className="w-full mt-5 py-2.5 rounded-xl bg-[#1E2021] hover:bg-[#2A2D2E] border border-[#26282B] text-xs font-semibold text-[#F4F2EC] transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {showPushBanner && (
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50">
          <div className="p-3.5 rounded-2xl bg-[#111314]/95 backdrop-blur-xl border border-[#B69A63]/50 text-[#F4F2EC] shadow-2xl flex items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold">Enable ORVION alerts</h4>
              <p className="text-[11px] text-[#AEB1AC] mt-1">Get tasks, leave decisions, assignments, and follow-up alerts on mobile.</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => navigator.serviceWorker.ready.then(subscribeToPush)} disabled={pushBusy} className="px-3 py-1.5 rounded-xl bg-[#B69A63] text-[#0B0C0D] text-xs font-bold cursor-pointer disabled:opacity-60">
                {pushBusy ? 'Enabling...' : 'Enable'}
              </button>
              <button onClick={() => setShowPushBanner(false)} className="p-1.5 text-[#AEB1AC] hover:text-white cursor-pointer" title="Dismiss"> <X className="w-4 h-4" /> </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
