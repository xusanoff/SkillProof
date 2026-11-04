/** Mic level: a bar that scales (transform only). Decorative; the state is also written as text. */
export function LevelMeter({ level }: { level: number }) {
  return (
    <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-border">
      <div
        className="h-full origin-left rounded-full bg-accent transition-transform duration-100 motion-reduce:transition-none"
        style={{ transform: `scaleX(${level})` }}
      />
    </div>
  );
}
