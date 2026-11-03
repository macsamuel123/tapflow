"use client";

export default function MenuError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl p-6 text-center">
      <h1 className="text-xl font-semibold">We couldn&apos;t load the menu</h1>
      <p className="mt-2 text-gray-600">Check your connection and try again, or ask your server.</p>
      <button type="button" onClick={reset} className="mt-4 rounded-lg bg-gray-900 px-4 py-2 font-medium text-white">
        Try again
      </button>
    </main>
  );
}
