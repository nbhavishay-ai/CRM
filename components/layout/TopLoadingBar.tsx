'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export const TopLoadingBar: React.FC = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Whenever the route actually resolves, complete the loading animation
  useEffect(() => {
    if (loading) {
      setProgress(100);
      const timer = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams]);

  // Global click interceptor for instant 0ms navigation feedback
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      const targetAttr = target.getAttribute('target');

      // Only trigger for internal links that aren't open-in-new-tab or anchors
      if (
        href &&
        href.startsWith('/') &&
        !href.startsWith('//') &&
        targetAttr !== '_blank' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey
      ) {
        // If clicking current route, don't trigger
        const currentFull = window.location.pathname + window.location.search;
        if (href === currentFull) return;

        setLoading(true);
        setProgress(25);

        // Advance progress smoothly while waiting
        const t1 = setTimeout(() => setProgress(65), 80);
        const t2 = setTimeout(() => setProgress(85), 250);

        // Safety fallback: if route does not change in 4s, hide bar
        const safetyTimer = setTimeout(() => {
          setLoading(false);
          setProgress(0);
        }, 4000);

        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
          clearTimeout(safetyTimer);
        };
      }
    };

    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 pointer-events-none h-[2.5px] bg-transparent"
      aria-hidden="true"
    >
      <div
        className="h-full bg-gradient-to-r from-[#B69A63] via-[#D2BE91] to-[#F4F2EC] shadow-[0_0_10px_rgba(182,154,99,0.8)] transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
          transition: progress === 100 ? 'width 150ms ease-out, opacity 200ms ease-out' : 'width 200ms ease-out',
        }}
      />
    </div>
  );
};
