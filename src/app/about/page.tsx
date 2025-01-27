import Link from "next/link";

const Editor = () => (
  <div className="flex flex-col h-screen bg-[var(--taskbar-indent)] text-[var(--text)]">
    <div className="flex-grow p-56">
      <Link href="/" className="text-[var(--text)] underline hover:text-[var(--accent)] dark:hover:text-rose-800">
        <p className="text-xl font-semibold">photoedit</p>
      </Link>

      <ul className="flex flex-col gap">
        <li>
          <Link
            href="/editor.html"
            className="underline decoration-dotted hover:decoration-solid hover:text-[var(--accent)] dark:hover:text-rose-800"
            >
            Photoedits Old
          </Link>
        </li>
        <li>
          <Link
            href="https://github.com/ClaytonWas/photoedit"
            className="underline decoration-dotted hover:decoration-solid hover:text-[var(--accent)] dark:hover:text-rose-800"
          >
            Repository
          </Link>
        </li>
      </ul>
    </div>
  </div>
);

export default Editor;