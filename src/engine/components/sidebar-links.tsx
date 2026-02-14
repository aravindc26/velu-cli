import { getGlobalAnchors, getLanguages } from '@/lib/velu';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitcher } from '@/components/lang-switcher';

function ExternalLinkIcon() {
  return (
    <svg
      className="velu-sidebar-link-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

export function SidebarLinks() {
  const anchors = getGlobalAnchors();
  const languages = getLanguages();

  return (
    <div className="velu-sidebar-footer">
      {anchors.length > 0 && (
        <div className="velu-sidebar-links">
          {anchors.map((anchor) => (
            <a
              key={anchor.href}
              href={anchor.href}
              target="_blank"
              rel="noopener noreferrer"
              className="velu-sidebar-link"
            >
              <span className="velu-sidebar-link-text">{anchor.anchor}</span>
              <ExternalLinkIcon />
            </a>
          ))}
        </div>
      )}
      <div className="velu-sidebar-footer-row">
        {languages.length > 1 && <LanguageSwitcher languages={languages} defaultLang={languages[0]} />}
        <ThemeToggle />
      </div>
    </div>
  );
}
