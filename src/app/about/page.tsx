import Link from "next/link";

const Editor = () => (
  <div className="flex flex-col h-full">

    <div className="flex justify-center p-8 mt-6">
        <div className="flex-grow max-w-5xl">
            <p className="text-[var(--foreground)]">Built for Desktop</p>
            <Link href='/photoedits/editor.html' className='text-[var(--foreground)] hover:underline hover:text-[var(--hyperlink)]'>
              <p className='text-md text-[var(--hyperlink)]'>Use Photoedits</p>
            </Link>
            <p className="text-[var(--foreground-text-secondary)] text-sm">A serverless version of photoedits deployed with static routing.</p>
            <Link href='/photoedits' className='text-[var(--foreground)] hover:underline hover:text-[var(--hyperlink)]'>
              <p className='text-md text-[var(--hyperlink)]'>Use Photoedits 2</p>
            </Link>
            <p className="text-[var(--foreground-text-secondary)] text-sm">In development.</p>
            <ul className="flex flex-col mt-10 gap-2 text-sm">
              <li>
                <Link href='https://webappphotoedits.onrender.com/' className='text-[var(--header-text-secondary)] underline decoration-dotted hover:decoration-solid hover:text-[var(--foreground-text-secondary-hover)]'>
                  <p>Web Deployment</p>
                </Link>
                <p className="text-xs text-[var(--header-text-secondary)]">with Render and Express</p>
              </li>

              <li>
                <Link href='https://github.com/ClaytonWas/Photoedits' className='text-[var(--header-text-secondary)] underline decoration-dotted hover:decoration-solid hover:text-[var(--foreground-text-secondary-hover)]'>
                  <p>GitHub Repository</p>
                </Link>
              </li>
            </ul>
        </div>
    </div>


  </div> 
);

export default Editor;