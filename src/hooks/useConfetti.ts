import confetti from "canvas-confetti";
import { useCallback } from "react";

export function useConfetti() {
  const fireConfetti = useCallback((options?: {
    particleCount?: number;
    spread?: number;
    origin?: { x?: number; y?: number };
    colors?: string[];
  }) => {
    const defaults = {
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#FFCB05", "#A7E868", "#0B3D91", "#3B9AFF"],
      ...options,
    };

    confetti({
      ...defaults,
      disableForReducedMotion: true,
    });
  }, []);

  const fireSuccess = useCallback(() => {
    // Fire from the center
    fireConfetti({
      particleCount: 80,
      spread: 100,
      origin: { y: 0.5 },
    });

    // Then fire from both sides
    setTimeout(() => {
      fireConfetti({
        particleCount: 50,
        spread: 60,
        origin: { x: 0.2, y: 0.6 },
      });
      fireConfetti({
        particleCount: 50,
        spread: 60,
        origin: { x: 0.8, y: 0.6 },
      });
    }, 150);
  }, [fireConfetti]);

  const fireSmall = useCallback(() => {
    fireConfetti({
      particleCount: 30,
      spread: 50,
      origin: { y: 0.7 },
    });
  }, [fireConfetti]);

  const fireStars = useCallback(() => {
    const count = 50;
    const defaults = {
      origin: { y: 0.7 },
      colors: ["#FFD700", "#FFA500", "#FF6347"],
    };

    function fire(particleRatio: number, opts: confetti.Options) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
        disableForReducedMotion: true,
      });
    }

    fire(0.25, {
      spread: 26,
      startVelocity: 55,
    });

    fire(0.2, {
      spread: 60,
    });

    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
    });

    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
    });

    fire(0.1, {
      spread: 120,
      startVelocity: 45,
    });
  }, []);

  return {
    fireConfetti,
    fireSuccess,
    fireSmall,
    fireStars,
  };
}
