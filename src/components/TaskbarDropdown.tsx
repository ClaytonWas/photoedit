"use client";

import React, { useState } from "react";

interface DropdownItem {
    label: string;
    onClick?: () => void;
}

interface TaskbarDropdownProps {
    title: string;
    items: DropdownItem[];
}

function TaskbarDropdown({ title, items }: TaskbarDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative w-12 text-sm text-[var(--text)] md:w-24 md:text-lg cursor-pointer">
            <button
                className="w-full text-left border border-b-transparent border-[var(--accent)] rounded-t bg-[var(--taskbar-indent)] hover:border-[var(--accent)] hover:bg-[var(--taskbar-hover)] md:pl-2"
                onClick={() => setIsOpen(!isOpen)}
            >
                {title}
            </button>
            {isOpen && (
                <ul className="absolute bg-[var(--taskbar-dropdown-indent)] z-50 shadow-lg text-xs md:text-base border-x border-[var(--accent)]">
                    {items.map((item, index) => (
                        <li
                            key={index}
                            className="pb-2 md:pb-0 px-1 pr-4 border border-transparent rounded-sm border-b-[var(--accent)] hover:bg-[var(--taskbar-dropdown-indent-hover)] text-nowrap min-w-24 first:hover:border-t-[var(--accent)]"
                            onClick={() => {
                                if (item.onClick) {
                                    item.onClick(); // Explicitly call the function
                                }
                                setIsOpen(false); // Close the dropdown after selection
                            }}
                        >
                            {item.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default TaskbarDropdown;
