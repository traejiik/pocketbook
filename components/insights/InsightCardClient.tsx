'use client';
import dynamic from 'next/dynamic';

export const InsightCardClient = dynamic(
  () => import('@/components/insights/InsightCard').then(m => m.InsightCard),
  { ssr: false }
);
