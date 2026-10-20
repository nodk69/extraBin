import confetti from 'canvas-confetti';

export const triggerConfetti = () => {
  try {
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#22c55e', '#10b981', '#34d399', '#38bdf8', '#818cf8'],
      disableForReducedMotion: true,
    });
  } catch {
    // Graceful fallback if canvas is unavailable
  }
};

export const triggerSuccessBurst = () => {
  try {
    const count = 120;
    const defaults = {
      origin: { y: 0.75 },
      colors: ['#22c55e', '#10b981', '#38bdf8', '#a855f7'],
      disableForReducedMotion: true,
    };

    confetti({
      ...defaults,
      particleCount: Math.floor(count * 0.4),
      spread: 45,
      startVelocity: 45,
    });
    setTimeout(() => {
      confetti({
        ...defaults,
        particleCount: Math.floor(count * 0.6),
        spread: 90,
        startVelocity: 35,
      });
    }, 100);
  } catch {
    // Graceful fallback
  }
};
