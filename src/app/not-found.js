import Link from "next/link";

/** Root-level 404 (renders outside the app chrome). */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg text-center">
      <p className="text-6xl font-semibold tracking-tight text-accent">404</p>
      <p className="mt-2 text-sm text-fg-muted">That page does not exist.</p>
      <Link href="/" className="mt-6 rounded-app-sm bg-accent px-4 py-2 text-sm font-medium text-white">Back to dashboard</Link>
    </div>
  );
}
