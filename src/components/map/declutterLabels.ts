export interface LabelCandidate<T> {
  value: T;
  position: [number, number];
  text: string;
  size: number;
  priority: number;
}

/** Screen-space label placement avoids GPU picking-color collisions between text layers. */
export function declutterLabels<T>(
  candidates: LabelCandidate<T>[],
  viewport: {
    width: number;
    height: number;
    project(position: number[]): number[];
  },
  measure: (text: string, size: number) => number,
): T[] {
  const boxes: { left: number; right: number; top: number; bottom: number }[] =
    [];
  const visible: T[] = [];
  for (const candidate of [...candidates].sort(
    (a, b) => b.priority - a.priority,
  )) {
    const [x, y] = viewport.project(candidate.position);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      x > viewport.width ||
      y < 0 ||
      y > viewport.height
    )
      continue;
    const lines = candidate.text.split("\n");
    const width =
      Math.max(...lines.map((line) => measure(line, candidate.size))) + 16;
    const height = lines.length * candidate.size + 16;
    const box = {
      left: x - width / 2,
      right: x + width / 2,
      top: y - height - 8,
      bottom: y + 4,
    };
    if (
      boxes.some(
        (other) =>
          box.left < other.right &&
          box.right > other.left &&
          box.top < other.bottom &&
          box.bottom > other.top,
      )
    )
      continue;
    boxes.push(box);
    visible.push(candidate.value);
  }
  return visible;
}
