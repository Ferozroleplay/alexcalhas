import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Option = {
  id: number;
  material: string;
};

type Props = {
  value: string;
  onChange: (id: string) => void;
  options: Option[];
  disabled?: boolean;
  placeholder?: string;
};

export function OrcMaterialSelect({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = "Selecione…",
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const selected = options.find((o) => String(o.id) === value);

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxHeight = Math.min(320, window.innerHeight - r.bottom - 12);
    const labels = [placeholder, ...options.map((o) => o.material)];
    const longestChars = labels.reduce((max, label) => Math.max(max, label.length), 0);
    const menuWidth = Math.min(
      window.innerWidth - 16,
      520,
      Math.max(r.width, longestChars * 7.4 + 56, 360),
    );
    let left = r.left;
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuWidth - 8);
    }
    setMenuStyle({
      position: "fixed",
      top: r.bottom + 4,
      left,
      width: menuWidth,
      maxHeight: Math.max(140, maxHeight),
      zIndex: 1065,
    });
  }, [options, placeholder]);

  useEffect(() => {
    if (!open) return;

    updateMenuPosition();

    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    function onReflow() {
      updateMenuPosition();
    }

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);

    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, updateMenuPosition]);

  function toggle() {
    if (disabled) return;
    setOpen((v) => !v);
  }

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`visitas-orc-material-select__trigger visitas-orc-input${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        title={selected?.material ?? placeholder}
        onClick={toggle}
      >
        <span className="visitas-orc-material-select__text">
          {selected?.material ?? placeholder}
        </span>
        <i className="bi bi-chevron-down visitas-orc-material-select__chevron" aria-hidden="true" />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="visitas-orc-material-select__menu"
              style={menuStyle}
              role="listbox"
              aria-label="Material"
            >
              <button
                type="button"
                className={`visitas-orc-material-select__option${value === "" ? " is-selected" : ""}`}
                role="option"
                aria-selected={value === ""}
                onClick={() => pick("")}
              >
                {placeholder}
              </button>
              {options.map((m) => {
                const id = String(m.id);
                const isSelected = value === id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`visitas-orc-material-select__option${isSelected ? " is-selected" : ""}`}
                    role="option"
                    aria-selected={isSelected}
                    title={m.material}
                    onClick={() => pick(id)}
                  >
                    {m.material}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
