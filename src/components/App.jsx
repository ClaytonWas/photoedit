import Link from "next/link";

const Editor = () => (
  <div className="flex flex-col h-screen bg-[var(--taskbar-indent)] text-[var(--text)] justify-center items-center">
    <div className="flex flex-col max-w-prose">
      <Link href="/" className="text-[var(--text)] p-2 mb-14">
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

          <p className="px-4 pt-6">
            todo:
          </p>

          <span className="p-4">
            <ul className="list-decimal ml-14 space-y-2">
              <li>File Extension Support (.cr3, .raw, etc.)</li>
              <li>LUT Import/Export</li>
            </ul>
          </span>
        </li>
      </ul>
    </div>
  </div>
);

export default Editor;