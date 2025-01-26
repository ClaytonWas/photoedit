import Link from "next/link";

const Editor = () => (
  <div className="flex flex-col h-full">

    <div className="flex justify-center p-8 mt-6">
        <div className="flex-grow max-w-5xl">
            <p className="">In Development. Built for Desktop.</p>
            <Link href='/editor.html' className='text-blue hover:underline hover:text-sky-600'>
              <p className='text-md text-[var(--hyperlink)]'>Use Photoedits 1</p>
            </Link>
            <p className="text-sm">A serverless version of photoedits deployed with static routing.</p>
            <ul className="flex flex-col mt-10 gap-2 text-sm">
              <li>
                <Link href='https://github.com/ClaytonWas/photoedit' className='text-blue underline decoration-dotted hover:decoration-solid hover:text-sky-600'>
                  <p>Repository</p>
                </Link>
              </li>
            </ul>
        </div>
    </div>


  </div> 
);

export default Editor;