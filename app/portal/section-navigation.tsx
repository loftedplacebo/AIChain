'use client';

import { useRef } from 'react';

export type SectionItem = { label: string; icon?: string; badge?: number };

export default function SectionNavigation({ items, active, onSelect, children }: {
  items: SectionItem[];
  active: string;
  onSelect: (section: string) => void;
  children?: React.ReactNode;
}) {
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  const entries = (mobile: boolean) => items.map(item =>
    <button key={item.label} type="button" aria-current={active === item.label ? 'page' : undefined}
      onClick={() => { onSelect(item.label); if (mobile && mobileMenu.current) mobileMenu.current.open = false; }}>
      {item.icon && <span aria-hidden="true">{item.icon}</span>}
      {item.label}
      {item.badge !== undefined && <b aria-label={`${item.badge} open incidents`}>{item.badge}</b>}
    </button>
  );

  return <>
    <nav className="gp-desktop-sections" aria-label="Workspace sections">{entries(false)}</nav>
    <details className="gp-mobile-sections" ref={mobileMenu}>
      <summary><span>Sections <strong>{active}</strong></span><span className="gp-menu-indicator" aria-hidden="true" /></summary>
      <nav aria-label="Workspace sections">{entries(true)}</nav>
      {children && <div className="gp-mobile-sections-extra">{children}</div>}
    </details>
  </>;
}
