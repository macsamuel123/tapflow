// Development landing page. Diners never see this: they arrive via a table QR URL
// (/r/{slug}/t/{tableId}?token=...). Run `make qr-urls` to print signed table links.
export default function Home() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold">Table Order — development</h1>
      <p className="mt-2 text-gray-600">
        Diners land on a signed table URL from a QR code. To get the URLs for the seeded restaurant, run:
      </p>
      <pre className="mt-3 rounded bg-gray-100 p-3 text-sm">make qr-urls</pre>
      <ul className="mt-6 list-disc space-y-1 pl-5 text-sm text-gray-700">
        <li>
          API health (proxied): <a className="underline" href="/api/health">/api/health</a>
        </li>
        <li>Menu, cart, checkout, KDS and dashboard pages arrive in M2–M4.</li>
      </ul>
    </main>
  );
}
