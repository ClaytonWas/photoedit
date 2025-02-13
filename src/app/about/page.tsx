import Link from "next/link";

const Editor = () => (
  <div className="flex flex-col h-screen bg-[var(--taskbar-indent)] text-[var(--text)] justify-center items-center">
    <div className="flex flex-col max-w-prose">
      <Link href="/" className="text-[var(--text)] underline p-2 mb-14 hover:text-[var(--accent)] dark:hover:text-rose-800">
        <p className="text-2xl font-semibold">photoedit</p>
      </Link>
      <ul className="flex flex-col">
        <li>
          <Link
            href="/editor.html"
            className="underline decoration-dotted text-xl font-bold hover:decoration-solid hover:text-[var(--accent)] dark:hover:text-rose-800"
          >
            <p className="text-lg font-semibold pt-4 px-4">WebappPhotoedits</p>
            <p className="text-sm mx-6 pb-2">stable build</p>
          </Link>

          <span className="px-4 flex gap-1">
            <Link href="/" className="text-[var(--text)] underline hover:text-[var(--accent)] dark:hover:text-rose-800">
            photoedit.ca
            </Link>
            <p>
            aims to be a cleaner version of this.
            </p>
          </span>

          <p className="px-4 pt-6">
            Rough list of things I want to implement:
          </p>

          <p className="p-4">
            <ul className="list-decimal ml-14 space-y-2">
              <li>File Extension Support (.cr3, .raw, etc.)</li>
              <li>LUT Import/Export</li>
            </ul>
          </p>
        </li>
      </ul>
    </div>
  </div>
);

export default Editor;