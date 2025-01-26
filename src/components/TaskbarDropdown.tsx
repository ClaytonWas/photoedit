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
        <div className="relative w-12 text-sm text-[var(--text)] md:w-24 md:text-lg">
            <button
                className="w-full text-left border border-transparent rounded-sm bg-[var(--background-indent)] hover:border-[var(--accent)] hover:bg-[var(--background-secondary-hover)] hover:font-semibold md:hover:font-medium md:pl-2"
                onClick={() => setIsOpen(!isOpen)}
            >
                {title}
            </button>
            {isOpen && (
                <ul className="absolute bg-[var(--background-indent)] z-50 border border-[var(--counter-intensity)] rounded-xs shadow-lg text-xs md:text-base">
                    {items.map((item, index) => (
                        <li
                            key={index}
                            className="pb-2 md:pb-0 px-1 pr-4 border-b rounded-sm border-[var(--background)] hover:border hover:border-[var(--accent)] hover:bg-[var(--background-secondary-hover)] hover:font-semibold md:hover:font-medium cursor-pointer text-nowrap min-w-24"
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
