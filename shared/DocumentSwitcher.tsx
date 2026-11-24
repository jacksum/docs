import { useEffect, useId, useRef, useState } from 'react';
import collection from '../collection.json';
import './document-switcher.css';

type Project = {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  glyph?: string;
};

const projects: Project[] = collection.projects;

const gridIcon = (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
    <path d="M3 3h3v3H3zm5.5 0h3v3h-3zM14 3h3v3h-3zM3 8.5h3v3H3zm5.5 0h3v3h-3zm5.5 0h3v3h-3zM3 14h3v3H3zm5.5 0h3v3h-3zm5.5 0h3v3h-3z" />
  </svg>
);

const bookIcon = (
  <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 6C9.6 4.5 6.6 4 3.5 4.4v13.3c3.1-.4 6.1.1 8.5 1.6 2.4-1.5 5.4-2 8.5-1.6V4.4C17.4 4 14.4 4.5 12 6Zm0 0v13.3" />
  </svg>
);

export function DocumentSwitcher({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const container = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open]);

  return (
    <nav
      aria-label="项目文档"
      className="collection-switcher"
      ref={container}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (!open || event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="collection-switcher-trigger"
        aria-label="切换文档"
        aria-expanded={open}
        aria-controls={panelId}
        title="切换文档"
        onClick={() => setOpen(value => !value)}
      >
        {gridIcon}
      </button>
      <div className="collection-switcher-panel" id={panelId} hidden={!open}>
        <div className="collection-switcher-heading">
          <span className="collection-switcher-book">{bookIcon}</span>
          <span>{collection.name}</span>
        </div>
        <ul className="collection-switcher-projects">
          {projects.map(({ id, label, description, icon, glyph }) => {
            const href = `${collection.base}${id}/`;
            return (
              <li key={id}>
                <a
                  href={href}
                  aria-current={id === current ? 'location' : undefined}
                  aria-label={label}
                  aria-describedby={description ? `${panelId}-${id}-description` : undefined}
                >
                  <span className="collection-switcher-mark" aria-hidden="true">
                    {icon ? <img src={`${href}${icon}`} width={30} height={30} alt="" /> : (glyph ?? label[0])}
                  </span>
                  <span className="collection-switcher-text">
                    <span className="collection-switcher-name">{label}</span>
                    {description ? <span className="collection-switcher-description" id={`${panelId}-${id}-description`}>{description}</span> : null}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
