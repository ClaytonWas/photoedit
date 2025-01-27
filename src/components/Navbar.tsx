"use client";
import Link from "next/link";
import Dropdown from "@/components/TaskbarDropdown";

const Navbar = ({ onUpload, onExport, onRotate, onHSV, onSepia, onGrayscale }) => {
  return (
    <div className="flex justify-between bg-[var(--background)] w-full px-2 pt-1 text-lg border-b border-[var(--accent)]">
      <nav className="flex">
        <Dropdown
          title="File"
          items={[
            { label: "Open", onClick: onUpload },
            { label: "Export", onClick: onExport },
          ]}
        />
        <Dropdown
          title="Image"
          items={[
            { label: "Rotate 90", onClick: () => onRotate(90) },
            { label: "Rotate 180", onClick: () => onRotate(180) },
          ]}
        />
        <Dropdown
          title="Filters"
          items={[
            { label: "HSV", onClick: onHSV },
            { label: "Sepia", onClick: () => onSepia(100) },
            { label: "Grayscale", onClick: () => onGrayscale(100) },
          ]}
        />
      </nav>

      <Link 
        href="/about" 
        className="border border-[var(--accent)] border-b-transparent text-[var(--text)] text-xs rounded-t md:text-base bg-[var(--taskbar-indent)] hover:bg-[var(--taskbar-hover)] px-2"
      >
        About
      </Link>
    </div>
  );
};

export default Navbar;