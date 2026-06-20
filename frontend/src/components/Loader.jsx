export function Spinner() {
  return (
    <div className="loader-container">
      <div className="spinner" />
    </div>
  );
}

export function SkeletonLines({ count = 4 }) {
  return (
    <div style={{ padding: 'var(--space-4)' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton skeleton-line" />
      ))}
    </div>
  );
}
