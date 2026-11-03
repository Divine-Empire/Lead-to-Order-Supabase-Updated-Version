import { useState, useRef, useEffect, useId } from "react";

// Search + select combobox for a free-text list (e.g. Company Group Name).
// When what the user typed matches no option, a "Create group" row lets them
// use it as a new value. Nothing is written to the DB here; the new value is
// simply handed to onChange and saved with the record.
const GroupCombobox = ({ id, value, options, onChange, placeholder = "Search or select group", createLabel = "Create group", allowCreate = true, maxVisible = 100 }) => {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const listId = useId();

  // Follow external changes (modal reopened, record switched).
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery(value || "");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [value]);

  const typed = query.trim().replace(/\s+/g, " ");
  const needle = typed.toLowerCase();
  // Right after picking an option the box shows the full value; show the whole list then.
  const filtered = !needle || needle === (value || "").toLowerCase() ? options : options.filter((o) => o.toLowerCase().includes(needle));
  const exact = options.find((o) => o.toLowerCase() === needle);
  const canCreate = allowCreate && !!typed && !exact;
  const shown = filtered.slice(0, maxVisible);

  const choose = (next) => {
    onChange(next);
    setQuery(next);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery(value || "");
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (exact) choose(exact);
      else if (filtered.length === 1 && !canCreate) choose(filtered[0]);
    }
  };

  const rowClass = "block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-primary/5";

  return (
    <div className="relative" ref={wrapRef}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value.trim() && value) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-md border border-input bg-card pl-3 pr-8 text-sm focus:border-primary focus:outline-none"
      />
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-muted-foreground">
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {open && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
          {shown.map((o) => (
            <li key={o} role="option" aria-selected={o === value}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                className={`${rowClass} ${o === value ? "bg-primary/5 font-medium text-primary" : "text-foreground"}`}
              >
                {o}
              </button>
            </li>
          ))}
          {filtered.length > shown.length && (
            <li className="px-3 py-2 text-xs italic text-muted-foreground">Showing {shown.length} of {filtered.length} -- type to narrow down</li>
          )}
          {filtered.length === 0 && !canCreate && (
            <li className="px-3 py-2 text-xs italic text-muted-foreground">{needle ? "No match" : "Nothing to select yet"}</li>
          )}
          {canCreate && (
            <li role="option" aria-selected="false" className={filtered.length ? "border-t" : ""}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(typed)}
                className={`${rowClass} font-medium text-primary`}
              >
                {createLabel} &quot;{typed}&quot;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default GroupCombobox;
