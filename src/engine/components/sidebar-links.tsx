import { getGlobalAnchors, getIconLibrary, getLanguages } from '@/lib/velu';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitcher } from '@/components/lang-switcher';
import { VeluIcon } from '@/components/icon';

function ExternalLinkIcon() {
  return (
    <VeluIcon name="external-link" className="velu-sidebar-link-icon" fallback={false} />
  );
}

export function SidebarLinks() {
  const anchors = getGlobalAnchors();
  const languages = getLanguages();
  const iconLibrary = getIconLibrary();

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
              <span className="velu-sidebar-link-left">
                <VeluIcon
                  name={anchor.icon}
                  iconType={anchor.iconType}
                  library={iconLibrary}
                  className="velu-sidebar-link-leading-icon"
                />
                <span className="velu-sidebar-link-text">{anchor.anchor}</span>
              </span>
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
