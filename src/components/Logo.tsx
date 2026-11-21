import Link from "next/link";

/** Approximation of the BDWY mark. Replace with the real logo file when available. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link className="logo" href={href} aria-label="Buildway">
      <span className="t">B D</span>
      <span className="b">W Y</span>
    </Link>
  );
}
