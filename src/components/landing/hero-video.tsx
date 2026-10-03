"use client";

import { useEffect, useRef, useState } from "react";

const CLIPS = [
  "/videos/hero-earth.mp4",
  "/videos/hero-charts.mp4",
  "/videos/hero-city.mp4",
  "/videos/hero-rooftop.mp4",
];

/** Muted background video that plays the clips in order and loops the playlist. */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // Respect reduced-motion: show the first frame, don't play.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.pause();
      return;
    }
    video.play().catch(() => {
      // Autoplay can be refused (e.g. power saving); the overlay still reads fine.
    });
  }, [index]);

  return (
    <video
      ref={ref}
      src={CLIPS[index]}
      autoPlay
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      onEnded={() => setIndex((i) => (i + 1) % CLIPS.length)}
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
    />
  );
}
