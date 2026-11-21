import Link from "next/link";

export function NotFound() {
  return (
    <section className="panel">
      <h2>This process has no template yet</h2>
      <p className="muted" style={{ marginTop: 8 }}>Only processes created from a template can be redesigned in this version.</p>
      <p style={{ marginTop: 16 }}><Link className="btn" href="/">Back to overview</Link></p>
    </section>
  );
}
