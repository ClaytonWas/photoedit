import Link from "next/link";

const Editor = () => (
  <div className="flex flex-col h-screen bg-[var(--background)] text-[var(--text)]">
    <div className="flex justify-center py-12">
      <div className="flex-grow max-w-5xl p-6 bg-[var(--background-secondary)] rounded-sm shadow-lg">
        <p className="text-lg mb-4">Built for Desktop</p>

        <Link
          href="/"
          className="text-[var(--accent)] hover:underline hover:text-[var(--accent-hover)]"
        >
          <p className="text-xl font-semibold">Photoedit</p>
        </Link>

        <p className="text-sm text-[var(--counter-intesity)] mb-6">
          In development.
        </p>

        <ul className="flex flex-col gap-4">
          <li>
            <Link
              href="/editor.html"
              className="text-[var(--counter-intensity)] underline decoration-dotted hover:decoration-solid hover:decoration-[var(--accent-hover-secondary)] hover:text-[var(--accent-hover-secondary)]"
              >
              Photoedits Old
            </Link>
          </li>
          <li>
            <Link
              href="https://github.com/ClaytonWas/photoedit"
              className="text-[var(--counter-intensity)] underline decoration-dotted hover:decoration-solid hover:decoration-[var(--accent-hover-secondary)] hover:text-[var(--accent-hover-secondary)]"
            >
              Repository
            </Link>
          </li>
        </ul>
      </div>
    </div>
  </div>
);

export default Editor;