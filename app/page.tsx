'use client';

import React from 'react';
import LiveDashboard from '@/components/live-dashboard';

export default function Home() {
  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#050505] text-gray-200 overflow-hidden font-sans">
      <div className="flex-1 w-full h-full relative overflow-hidden">
        <LiveDashboard />
      </div>
    </div>
  );
}

