/** Site-wide background: slow-drifting colour fields and a faint dot grid (styles in globals.css, `.jm-aurora`). Decorative only. */
export default function BackgroundAurora() {
  return (
    <div className="jm-aurora" aria-hidden="true">
      <span className="a1" />
      <span className="a2" />
      <span className="a3" />
    </div>
  );
}
