"use client";
import { MotionConfig } from "motion/react";

// Honors prefers-reduced-motion for every animation: transforms are dropped, opacity kept.
export default function Motion({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
