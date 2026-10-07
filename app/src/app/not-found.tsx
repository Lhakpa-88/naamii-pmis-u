import Link from "next/link";

/**
 * Shown when a record does not exist OR the signed-in user is not authorised to
 * see it. The two cases are deliberately indistinguishable so a URL cannot be
 * used to probe for other labs' projects.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cool-100 px-6">
      <div className="max-w-md rounded-card border border-cool-200 bg-white p-8 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-brand">Not available</p>
        <h1 className="mt-2 text-[20px] font-semibold text-ink">This page isn’t available to you</h1>
        <p className="mt-2 text-[13.5px] text-grey">Either it doesn’t exist, or your role doesn’t include access to it. If you believe you should see it, ask Finance &amp; Operations to check your assignment.</p>
        <Link href="/" className="mt-5 inline-block rounded-md bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#b80404]">Back to my dashboard</Link>
      </div>
    </div>
  );
}
