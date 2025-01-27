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
        <div className="relative min-w-16 text-sm text-[var(--text)] m-1 pr-1 md:w-24 md:text-lg cursor-pointer">
            <button
                className={`w-full text-left border border-[var(--accent)] rounded-t bg-[var(--taskbar-indent)] pl-2 ${
                    isOpen ? "border-b-transparent" : "hover:border-[var(--accent)] hover:bg-[var(--taskbar-hover)]"
                }`}
                onClick={() => setIsOpen(!isOpen)}
            >
                {title}
            </button>
            {isOpen && (
                <ul
                    className={`absolute bg-[var(--taskbar-dropdown-indent)] z-50 shadow-lg text-xs md:text-base border-x border-[var(--accent)] border-t rounded-b ${
                        isOpen ? "border-t-[var(--accent)]" : "border-t-transparent"
                    }`}
                >
                    {items.map((item, index) => (
                        <li
                            key={index}
                            className="pb-2 md:pb-0 px-1 pr-4 border border-transparent rounded-sm border-b-[var(--accent)] hover:bg-[var(--taskbar-dropdown-indent-hover)] text-nowrap min-w-24"
                            onClick={() => {
                                if (item.onClick) {
                                    item.onClick();
                                }
                                setIsOpen(false);
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
