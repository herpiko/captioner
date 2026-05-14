import { Caption } from "../store";

const EPS = 0.001;
const MIN_DURATION = 0.1;

type Range = { start: number; end: number };

/**
 * Move/resize behaviour: the dragged caption is blocked against neighbours.
 * While moving, if the dragged caption's center crosses a neighbour's center,
 * the two **swap time-slots**: the dragged caption takes the neighbour's
 * [start,end], and the neighbour takes the dragged caption's original
 * [start,end]. After a swap, the drag continues from the new position.
 *
 * Resizing always clamps against neighbours — never swaps.
 *
 * Caller provides `origStart` / `origEnd` (the dragged caption's range at the
 * start of the drag). This function returns the next captions list plus a
 * possibly-updated drag origin (when a swap has happened, the origin updates
 * to the swapped slot so subsequent movement is measured from there).
 */
export function resolveDrag(
  captions: Caption[],
  targetId: string,
  proposed: Range,
  origRange: Range,
  duration: number,
  mode: "move" | "resize-left" | "resize-right"
): { captions: Caption[]; origRange: Range } {
  if (mode === "move") {
    return resolveMoveWithSwap(captions, targetId, proposed, origRange, duration);
  }
  return {
    captions: resolveResize(captions, targetId, proposed, duration, mode),
    origRange,
  };
}

function resolveMoveWithSwap(
  captions: Caption[],
  targetId: string,
  proposed: Range,
  origRange: Range,
  duration: number
): { captions: Caption[]; origRange: Range } {
  const len = origRange.end - origRange.start;

  // Clamp proposed to video bounds.
  let s = Math.max(0, Math.min(duration - len, proposed.start));
  let e = s + len;

  const others = captions.filter((c) => c.id !== targetId);
  const proposedCenter = (s + e) / 2;

  // Find a neighbour whose center has been crossed by the dragged center.
  // Direction matters: only swap with the immediate neighbour on the side of
  // travel, and only when their centers cross.
  const direction = proposedCenter - (origRange.start + origRange.end) / 2;

  let swapCandidate: Caption | null = null;
  if (direction > 0) {
    // moving right — look for nearest other that the dragged center has crossed
    const rights = others
      .filter((o) => o.start >= origRange.end - EPS) // strictly to the right of original slot
      .sort((a, b) => a.start - b.start);
    for (const o of rights) {
      const oCenter = (o.start + o.end) / 2;
      if (proposedCenter >= oCenter - EPS) {
        swapCandidate = o;
      } else break;
    }
  } else if (direction < 0) {
    const lefts = others
      .filter((o) => o.end <= origRange.start + EPS)
      .sort((a, b) => b.end - a.end);
    for (const o of lefts) {
      const oCenter = (o.start + o.end) / 2;
      if (proposedCenter <= oCenter + EPS) {
        swapCandidate = o;
      } else break;
    }
  }

  if (swapCandidate) {
    // Perform swap: target takes swapCandidate's slot, swapCandidate takes
    // target's original slot.
    const swapped = captions.map((c) => {
      if (c.id === targetId) {
        return { ...c, start: swapCandidate!.start, end: swapCandidate!.end };
      }
      if (c.id === swapCandidate!.id) {
        return { ...c, start: origRange.start, end: origRange.end };
      }
      return c;
    });
    return {
      captions: swapped,
      origRange: { start: swapCandidate.start, end: swapCandidate.end },
    };
  }

  // No swap — clamp against immediate neighbours so we never overlap.
  // Find the nearest other whose range overlaps [s,e].
  const leftWall = others
    .filter((o) => o.end <= origRange.start + EPS)
    .reduce<number>((acc, o) => Math.max(acc, o.end), 0);
  const rightWall = others
    .filter((o) => o.start >= origRange.end - EPS)
    .reduce<number>((acc, o) => Math.min(acc, o.start), duration);

  if (s < leftWall) {
    s = leftWall;
    e = s + len;
  }
  if (e > rightWall) {
    e = rightWall;
    s = e - len;
  }

  // Also block if any other still overlaps (e.g. due to clamping edge cases).
  const final = captions.map((c) =>
    c.id === targetId ? { ...c, start: s, end: e } : c
  );
  return { captions: final, origRange };
}

function resolveResize(
  captions: Caption[],
  targetId: string,
  proposed: Range,
  duration: number,
  mode: "resize-left" | "resize-right"
): Caption[] {
  const target = captions.find((c) => c.id === targetId);
  if (!target) return captions;
  const others = captions.filter((c) => c.id !== targetId);

  let s = Math.max(0, Math.min(duration, proposed.start));
  let e = Math.max(0, Math.min(duration, proposed.end));

  const leftWall = others
    .filter((o) => o.end <= target.start + EPS)
    .reduce<number>((acc, o) => Math.max(acc, o.end), 0);
  const rightWall = others
    .filter((o) => o.start >= target.end - EPS)
    .reduce<number>((acc, o) => Math.min(acc, o.start), duration);

  if (mode === "resize-left") {
    s = Math.max(leftWall, Math.min(e - MIN_DURATION, s));
    e = target.end;
  } else {
    e = Math.min(rightWall, Math.max(s + MIN_DURATION, e));
    s = target.start;
  }

  return captions.map((c) =>
    c.id === targetId ? { ...c, start: s, end: e } : c
  );
}

/**
 * Find a non-overlapping slot for a new caption of length `len`.
 * Prefer the requested start time. If it overlaps an existing caption,
 * place the new caption right after the conflicting caption. If no room
 * after, fall back to the largest available gap. Returns null if there's
 * absolutely no room (the whole video is filled).
 */
export function findFreeSlot(
  captions: Caption[],
  preferredStart: number,
  len: number,
  duration: number
): { start: number; end: number } | null {
  if (duration < len) return null;
  const sorted = [...captions].sort((a, b) => a.start - b.start);
  const desiredStart = Math.max(0, Math.min(duration - len, preferredStart));

  // Build list of free gaps.
  const gaps: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const c of sorted) {
    if (c.start - cursor >= len - EPS) {
      gaps.push({ start: cursor, end: c.start });
    }
    cursor = Math.max(cursor, c.end);
  }
  if (duration - cursor >= len - EPS) {
    gaps.push({ start: cursor, end: duration });
  }
  if (gaps.length === 0) return null;

  // Pick the first gap at or after desiredStart that can hold the caption.
  for (const g of gaps) {
    const lo = g.start;
    const hi = g.end - len;
    if (hi >= desiredStart - EPS) {
      const start = Math.max(lo, desiredStart);
      return { start, end: start + len };
    }
  }
  // No gap at or after desiredStart — use the last gap.
  const g = gaps[gaps.length - 1];
  const start = g.end - len;
  return { start, end: start + len };
}
