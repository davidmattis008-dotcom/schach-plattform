"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export type SelectMenuOption = {
  value: string;
  label: string;
};

type SelectMenuProps = {
  "aria-label": string;
  value: string;
  options: SelectMenuOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
};

export function SelectMenu({
  "aria-label": ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
  compact = false,
  className = "",
}: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const searchable = options.length > 20;
  const selected = options.find((option) => option.value === value);
  const filteredOptions = searchable
    ? options.filter((option) => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    if (searchable) {
      searchRef.current?.focus();
    } else {
      rootRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    }

    function dismiss(event: PointerEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setOpen(false);
        setQuery("");
        triggerRef.current?.focus();
      } else if (event instanceof PointerEvent && !rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [open, searchable]);

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>) {
    const buttons = rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    if (!buttons?.length) return;
    const currentIndex = Array.from(buttons).indexOf(event.currentTarget);
    const nextIndex = event.key === "ArrowDown"
      ? (currentIndex + 1) % buttons.length
      : event.key === "ArrowUp"
        ? (currentIndex - 1 + buttons.length) % buttons.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : -1;
    if (nextIndex >= 0) {
      event.preventDefault();
      buttons[nextIndex].focus();
    }
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 text-sm ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled || options.length === 0}
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
        className={`flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-700 bg-black text-left text-white transition hover:border-amber-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "min-h-9 px-2.5 py-1.5 text-xs" : "min-h-11 px-3 py-2.5"}`}
      >
        <span className="min-w-0 truncate">{selected?.label ?? "Auswählen"}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`h-4 w-4 shrink-0 text-amber-200 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-neutral-700 bg-black shadow-xl shadow-black/60">
          {searchable && (
            <div className="border-b border-neutral-800 p-2">
              <input
                ref={searchRef}
                type="search"
                aria-label={`${ariaLabel} durchsuchen`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    rootRef.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus();
                  }
                }}
                placeholder="Suchen …"
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-amber-300 focus:outline-none"
              />
            </div>
          )}
          <div id={menuId} role="listbox" aria-label={ariaLabel} className="max-h-64 overflow-y-auto p-1">
            {filteredOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  onKeyDown={moveFocus}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setQuery("");
                    triggerRef.current?.focus();
                  }}
                  className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 ${isSelected ? "bg-amber-300/10 text-amber-200" : "text-neutral-200 hover:bg-neutral-900 hover:text-white"}`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <span aria-hidden="true" className="shrink-0 text-amber-300">✓</span>}
                </button>
              );
            })}
            {filteredOptions.length === 0 && <p className="px-2.5 py-3 text-sm text-neutral-500">Keine Treffer.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
