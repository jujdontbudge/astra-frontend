export const springs = {
  soft: { type: "spring", stiffness: 190, damping: 30, mass: 1.06 },
  quick: { type: "spring", stiffness: 330, damping: 30, mass: 0.82 },
  panel: { type: "spring", stiffness: 220, damping: 31, mass: 1 },
  grand: { type: "spring", stiffness: 150, damping: 28, mass: 1.16 },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 24, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -14, scale: 0.99 },
};

export const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.11,
      delayChildren: 0.08,
    },
  },
};

export const premiumCard = {
  hidden: { opacity: 0, y: 28, scale: 0.96, rotateX: -4 },
  show: { opacity: 1, y: 0, scale: 1, rotateX: 0 },
  exit: { opacity: 0, y: -18, scale: 0.98 },
};

export function reduceAware(reduced, motionValue, stillValue = {}) {
  return reduced ? stillValue : motionValue;
}
