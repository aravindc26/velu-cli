import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { cloneElement, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { Accordion as FumaAccordion, Accordions as FumaAccordions } from 'fumadocs-ui/components/accordion';
import { Tab as FumaTab, Tabs as FumaTabs } from 'fumadocs-ui/components/tabs';
import { Step as FumaStep, Steps as FumaSteps } from 'fumadocs-ui/components/steps';
import { File as FumaFile, Files as FumaFiles, Folder as FumaFolder } from 'fumadocs-ui/components/files';
import { VeluIcon } from '@/components/icon';
import { VeluCodeGroup } from '@/components/code-group';
import { VeluColor, VeluColorItem, VeluColorRow } from '@/components/color';
import { VeluExpandable } from '@/components/expandable';
import { VeluMermaid } from '@/components/mermaid';
import { VeluPrompt } from '@/components/prompt';
import { VeluSyncedTabs } from '@/components/synced-tabs';
import { VeluView } from '@/components/view';
import { getIconLibrary } from '@/lib/velu';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  const Card = defaultMdxComponents.Card as any;
  const Cards = defaultMdxComponents.Cards as any;
  const iconLibrary = getIconLibrary();
  const Callout = defaultMdxComponents.Callout as any;
  const CalloutTitle = defaultMdxComponents.CalloutTitle as any;
  const CalloutDescription = defaultMdxComponents.CalloutDescription as any;
  const toTokenList = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (value == null || value === false) return [];
    return [String(value)];
  };
  const hintIconName = 'lightbulb';
  const VeluTreeFolder = ({
    name,
    defaultOpen = false,
    openable = true,
    children,
    className,
    ...props
  }: any) => {
    if (openable === false) {
      return (
        <div className={['velu-tree-folder', 'velu-tree-folder-static', className].filter(Boolean).join(' ')} {...props}>
          <div className="velu-tree-folder-label">{name ?? 'folder'}</div>
          {children ? <div className="velu-tree-children">{children}</div> : null}
        </div>
      );
    }

    return (
      <FumaFolder
        name={name ?? 'folder'}
        defaultOpen={Boolean(defaultOpen)}
        className={['velu-tree-folder', className].filter(Boolean).join(' ')}
        {...props}
      >
        {children}
      </FumaFolder>
    );
  };
  const VeluTreeFile = ({ name, icon, className, ...props }: any) => (
    <FumaFile
      name={name ?? 'file'}
      icon={icon}
      className={['velu-tree-file', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
  const VeluTree = Object.assign(
    ({ children, className, ...props }: any) => (
      <FumaFiles className={['velu-tree', className].filter(Boolean).join(' ')} {...props}>
        {children}
      </FumaFiles>
    ),
    {
      Folder: VeluTreeFolder,
      File: VeluTreeFile,
    },
  );

  return {
    ...defaultMdxComponents,
    ...components,
    // Mint-style aliases used in imported docs content.
    Note: ({ children }: { children?: ReactNode }) => (
      <Callout type="info" className="velu-callout velu-callout-info">{children}</Callout>
    ),
    Warning: ({ children }: { children?: ReactNode }) => (
      <Callout type="warning" className="velu-callout velu-callout-warning">{children}</Callout>
    ),
    Info: ({ children }: { children?: ReactNode }) => (
      <Callout type="info" className="velu-callout velu-callout-info">{children}</Callout>
    ),
    Tip: ({ children }: { children?: ReactNode }) => (
      <Callout type="idea" className="velu-callout velu-callout-idea">{children}</Callout>
    ),
    Check: ({ children }: { children?: ReactNode }) => (
      <Callout type="success" className="velu-callout velu-callout-success">{children}</Callout>
    ),
    Danger: ({ children }: { children?: ReactNode }) => (
      <Callout type="error" className="velu-callout velu-callout-error">{children}</Callout>
    ),
    // Mint uses `CardGroup`; Fumadocs uses `Cards`.
    CardGroup: ({ cols, className, style, ...props }: any) => (
      <Cards
        {...props}
        className={[
          'velu-card-group',
          cols === 1 ? 'velu-card-group-cols-1' : '',
          className,
        ].filter(Boolean).join(' ')}
        style={{ ...style, ...(cols ? { ['--velu-card-cols' as any]: String(cols) } : {}) }}
      />
    ),
    CardDeck: (props: any) => <Cards {...props} className={['velu-card-deck', props.className].filter(Boolean).join(' ')} />,
    // Mint compatibility for Card icon strings + horizontal layout.
    Card: ({
      horizontal,
      icon,
      iconType,
      img,
      image,
      color,
      cta,
      arrow,
      className,
      children,
      ...props
    }: any) => (
      <Card
        {...props}
        icon={typeof icon === 'string'
          ? (
            <VeluIcon
              name={icon}
              library={iconLibrary}
              iconType={iconType}
              color={typeof color === 'string' && color.startsWith('#') ? color : undefined}
            />
          )
          : icon}
        className={[
          'velu-card',
          className,
          horizontal ? 'velu-card-horizontal' : '',
          (color && !(typeof color === 'string' && color.startsWith('#')))
            ? `velu-card-color-${String(color)}`
            : '',
        ].filter(Boolean).join(' ')}
      >
        {(img || image) ? (
          <img src={img ?? image} alt="" className="velu-card-image" />
        ) : null}
        {children}
        {(cta || arrow) ? (
          <div className="velu-card-cta">
            {cta ? <span>{cta}</span> : null}
            {arrow ? <VeluIcon name="arrow-right" library={iconLibrary} className="velu-card-cta-arrow" /> : null}
          </div>
        ) : null}
      </Card>
    ),
    Accordions: FumaAccordions as any,
    Accordion: FumaAccordion as any,
    CodeGroup: VeluCodeGroup as any,
    Frame: ({ children, caption, hint, className }: any) => (
      <>
        {hint ? (
          <div className="velu-frame-hint">
            <VeluIcon name={hintIconName} library={iconLibrary} className="velu-frame-hint-icon" />
            <span>{hint}</span>
          </div>
        ) : null}
        <figure className={['velu-frame', className].filter(Boolean).join(' ')}>
          <div className="velu-frame-content">{children}</div>
          {caption ? (
            <figcaption>
              {typeof caption === 'string' ? (
                <span
                  dangerouslySetInnerHTML={{
                    __html: caption
                      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
                      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'),
                  }}
                />
              ) : (
                caption
              )}
            </figcaption>
          ) : null}
        </figure>
      </>
    ),
    Badge: ({
      children,
      className,
      color = 'gray',
      size = 'md',
      shape = 'rounded',
      round,
      icon,
      stroke,
      disabled,
      iconType,
    }: any) => (
      <span
        className={[
          'velu-badge',
          `velu-badge-color-${String(color)}`,
          `velu-badge-size-${String(size)}`,
          `velu-badge-shape-${String(round ? 'pill' : shape)}`,
          stroke ? 'velu-badge-stroke' : '',
          disabled ? 'velu-badge-disabled' : '',
          className,
        ].filter(Boolean).join(' ')}
      >
        {icon ? (
          <span className="velu-badge-icon">
            <VeluIcon name={String(icon)} library={iconLibrary} iconType={iconType} />
          </span>
        ) : null}
        <span>{children}</span>
      </span>
    ),
    Banner: ({ children, className, color = 'default', href, icon, iconType }: any) => {
      const content = (
        <>
          {icon ? (
            <span className="velu-banner-icon">
              <VeluIcon name={String(icon)} library={iconLibrary} iconType={iconType} />
            </span>
          ) : null}
          <div className="velu-banner-content">{children}</div>
        </>
      );

      const classes = ['velu-banner', `velu-banner-${String(color)}`, className].filter(Boolean).join(' ');
      if (href) {
        return (
          <a href={href} className={classes}>
            {content}
          </a>
        );
      }

      return <div className={classes}>{content}</div>;
    },
    Color: VeluColor as any,
    'Color.Item': VeluColorItem as any,
    'Color.Row': VeluColorRow as any,
    ColorItem: VeluColorItem as any,
    ColorRow: VeluColorRow as any,
    Columns: ({ children, className, cols, style }: any) => (
      <div
        className={['velu-columns', className].filter(Boolean).join(' ')}
        style={{ ...style, ...(cols ? { ['--velu-columns-count' as any]: String(cols) } : {}) }}
      >
        {children}
      </div>
    ),
    Column: ({ children, className }: any) => (
      <div className={['velu-column', className].filter(Boolean).join(' ')}>{children}</div>
    ),
    Examples: ({ children, className }: any) => (
      <div className={['velu-examples', className].filter(Boolean).join(' ')}>{children}</div>
    ),
    Panel: ({ title, children, className }: any) => (
      <aside className={['velu-panel', className].filter(Boolean).join(' ')}>
        {title ? <h4>{title}</h4> : null}
        {children}
      </aside>
    ),
    Prompt: VeluPrompt as any,
    Response: ({ children, className }: any) => (
      <section className={['velu-response', className].filter(Boolean).join(' ')}>{children}</section>
    ),
    Tabs: VeluSyncedTabs as any,
    Tab: ({ title, icon, iconType, className, ...props }: any) => (
      <FumaTab
        {...props}
        data-title={typeof title === 'string' ? title : undefined}
        className={['!p-0 !bg-transparent !rounded-none !border-0', className].filter(Boolean).join(' ')}
      />
    ),
    Steps: FumaSteps as any,
    Step: ({ title, children, ...props }: any) => (
      <FumaStep {...props}>
        {title ? <p className="velu-step-title">{title}</p> : null}
        {children}
      </FumaStep>
    ),
    Expandable: VeluExpandable as any,
    ParamField: ({
      body,
      query,
      path,
      header,
      id,
      type,
      required,
      deprecated,
      default: defaultProp,
      children,
      className,
      ...props
    }: any) => {
      const locationPairs: Array<['query' | 'path' | 'body' | 'header', unknown]> = [
        ['query', query],
        ['path', path],
        ['body', body],
        ['header', header],
      ];
      const location = locationPairs.find(([, value]) => Boolean(value));
      const locationKey = location?.[0];
      const locationValue = location?.[1];
      const fieldName = typeof locationValue === 'string' && locationValue.trim()
        ? locationValue.trim()
        : undefined;
      const anchorBase = (fieldName ?? 'param').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const anchorId = typeof id === 'string' && id.trim() ? id.trim() : `param-${anchorBase || 'param'}`;

      return (
        <section id={anchorId} className={['velu-param-field-item', className].filter(Boolean).join(' ')} {...props}>
          <div className="velu-param-head">
            <a className="velu-param-anchor" href={`#${anchorId}`} aria-label={`Anchor for ${fieldName ?? 'param'}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </a>
            <code>{fieldName ?? 'param'}</code>
            {type ? <span className="velu-pill velu-pill-type">{String(type)}</span> : null}
            {required ? <span className="velu-pill velu-pill-required">required</span> : null}
            {deprecated ? <span className="velu-pill velu-pill-deprecated">deprecated</span> : null}
            {defaultProp != null ? <em>default: {String(defaultProp)}</em> : null}
          </div>
          {children ? <div className="velu-param-body">{children}</div> : null}
        </section>
      );
    },
    Param: ({ name, type, required, defaultValue, children, className }: any) => (
      <div className={['velu-param', className].filter(Boolean).join(' ')}>
        <div className="velu-param-head">
          <code>{name ?? 'param'}</code>
          {type ? <span>{type}</span> : null}
          {required ? <strong>required</strong> : null}
          {defaultValue ? <em>default: {String(defaultValue)}</em> : null}
        </div>
        {children ? <div className="velu-param-body">{children}</div> : null}
      </div>
    ),
    RequestExample: ({ children, className, ...props }: any) => (
      <section className={['velu-request-example', className].filter(Boolean).join(' ')} {...props}>
        <FumaTabs items={['Request']}>
          <FumaTab>{children}</FumaTab>
        </FumaTabs>
      </section>
    ),
    ResponseField: ({
      id,
      name,
      type,
      required,
      deprecated,
      default: defaultProp,
      defaultValue,
      pre,
      post,
      children,
      className,
      ...props
    }: any) => {
      const preTokens = toTokenList(pre);
      const postTokens = toTokenList(post);
      const resolvedDefault = defaultProp ?? defaultValue;
      const hasFieldProps = Boolean(name || type || required || deprecated || preTokens.length || postTokens.length || resolvedDefault != null);
      const anchorBase = String(name ?? 'response').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const anchorId = typeof id === 'string' && id.trim() ? id.trim() : `response-${anchorBase || 'field'}`;

      if (!hasFieldProps) {
        return (
          <section className={['velu-response-field', className].filter(Boolean).join(' ')} {...props}>
            {children}
          </section>
        );
      }

      return (
        <section id={anchorId} className={['velu-response-field-item', className].filter(Boolean).join(' ')} {...props}>
          <div className="velu-property-head">
            <a className="velu-param-anchor" href={`#${anchorId}`} aria-label={`Anchor for ${name ?? 'response field'}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </a>
            {preTokens.map((token, index) => (
              <span key={`pre-${token}-${index}`} className="velu-pill velu-pill-type">{token}</span>
            ))}
            <code>{name ?? 'response'}</code>
            {type ? <span className="velu-pill velu-pill-type">{String(type)}</span> : null}
            {required ? <span className="velu-pill velu-pill-required">required</span> : null}
            {deprecated ? <span className="velu-pill velu-pill-deprecated">deprecated</span> : null}
            {resolvedDefault != null ? <em>default: {String(resolvedDefault)}</em> : null}
            {postTokens.map((token, index) => (
              <span key={`post-${token}-${index}`} className="velu-pill velu-pill-type">{token}</span>
            ))}
          </div>
          {children ? <div className="velu-property-body">{children}</div> : null}
        </section>
      );
    },
    ResponseExample: ({ children, className, ...props }: any) => (
      <section className={['velu-response-example', className].filter(Boolean).join(' ')} {...props}>
        <FumaTabs items={['Response']}>
          <FumaTab>{children}</FumaTab>
        </FumaTabs>
      </section>
    ),
    Properties: ({ children, className }: any) => (
      <section className={['velu-properties', className].filter(Boolean).join(' ')}>{children}</section>
    ),
    Property: ({ name, type, required, children, className }: any) => (
      <div className={['velu-property', className].filter(Boolean).join(' ')}>
        <div className="velu-property-head">
          <code>{name ?? 'property'}</code>
          {type ? <span>{type}</span> : null}
          {required ? <strong>required</strong> : null}
        </div>
        {children ? <div className="velu-property-body">{children}</div> : null}
      </div>
    ),
    Endpoint: ({ method = 'GET', path, children, className }: any) => (
      <section className={['velu-endpoint', className].filter(Boolean).join(' ')}>
        <div className="velu-endpoint-head">
          <span>{String(method).toUpperCase()}</span>
          <code>{path ?? '/'}</code>
        </div>
        {children ? <div className="velu-endpoint-body">{children}</div> : null}
      </section>
    ),
    APIPlayground: ({ endpoint, method = 'GET', className }: any) => (
      <section className={['velu-api-playground', className].filter(Boolean).join(' ')}>
        <div>API Playground</div>
        <div><code>{String(method).toUpperCase()} {endpoint ?? '/'}</code></div>
      </section>
    ),
    ApiPlayground: ({ endpoint, method, className }: any) => (
      <section className={['velu-api-playground', className].filter(Boolean).join(' ')}>
        <div>API Playground</div>
        <div><code>{String((method ?? 'GET')).toUpperCase()} {endpoint ?? '/'}</code></div>
      </section>
    ),
    OpenAPI: ({ src, path, className }: any) => (
      <section className={['velu-openapi', className].filter(Boolean).join(' ')}>
        <div>OpenAPI</div>
        <div><code>{src ?? path ?? 'openapi.json'}</code></div>
      </section>
    ),
    Snippet: ({ id, name, title, children, className }: any) => (
      <section className={['velu-snippet', className].filter(Boolean).join(' ')}>
        {title ? <h4>{title}</h4> : null}
        {children ?? <p>Snippet: <code>{id ?? name ?? 'snippet'}</code></p>}
      </section>
    ),
    Video: ({ src, title, className }: any) => (
      <div className={['velu-video', className].filter(Boolean).join(' ')}>
        {src ? (
          <iframe
            src={src}
            title={title ?? 'Video'}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : null}
      </div>
    ),
    Update: ({ label, date, description, tags, rss, children, className, ...props }: any) => {
      void rss;
      const updateLabel = String(label ?? date ?? 'Update');
      const updateDescription = description != null ? String(description) : undefined;
      const updateTags = toTokenList(tags);
      const anchorBase = updateLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const anchorId = `update-${anchorBase || 'item'}`;

      return (
        <section id={anchorId} className={['velu-update', className].filter(Boolean).join(' ')} {...props}>
          <div className="velu-update-meta">
            <a className="velu-update-label" href={`#${anchorId}`}>{updateLabel}</a>
            {updateDescription ? <div className="velu-update-description">{updateDescription}</div> : null}
            {updateTags.length ? (
              <div className="velu-update-tags">
                {updateTags.map((tag, index) => (
                  <span key={`${tag}-${index}`} className="velu-update-tag">{tag}</span>
                ))}
              </div>
            ) : null}
          </div>
          {children ? <div className="velu-update-content">{children}</div> : null}
        </section>
      );
    },
    Tooltip: ({ tip, text, content, headline, cta, href, children, className }: any) => {
      const tooltipBody = tip ?? text ?? content ?? '';
      const hasCard = Boolean(headline || tooltipBody || cta);
      return (
        <span className={['velu-tooltip-wrap', className].filter(Boolean).join(' ')}>
          <span className="velu-tooltip" title={tooltipBody}>
            {children}
          </span>
          {hasCard ? (
            <span className="velu-tooltip-popover" role="tooltip">
              {headline ? <span className="velu-tooltip-headline">{headline}</span> : null}
              {tooltipBody ? <span className="velu-tooltip-text">{tooltipBody}</span> : null}
              {cta ? (
                href ? (
                  <a href={href} className="velu-tooltip-cta">{cta}</a>
                ) : (
                  <span className="velu-tooltip-cta">{cta}</span>
                )
              ) : null}
            </span>
          ) : null}
        </span>
      );
    },
    Tiles: ({ children, className }: any) => (
      <div className={['velu-tiles', className].filter(Boolean).join(' ')}>{children}</div>
    ),
    Tile: ({ title, href, description, children, className, ...props }: any) => {
      const isPlainTextChild = typeof children === 'string' || typeof children === 'number';
      const resolvedDescription = description ?? (isPlainTextChild ? String(children) : undefined);
      const preview = isPlainTextChild ? null : children;

      return (
        <a href={href ?? '#'} className={['velu-tile', className].filter(Boolean).join(' ')} {...props}>
          {preview ? <span className="velu-tile-preview">{preview}</span> : null}
          {(title || resolvedDescription) ? (
            <span className="velu-tile-body">
              {title ? <strong className="velu-tile-title">{title}</strong> : null}
              {resolvedDescription ? <span className="velu-tile-description">{resolvedDescription}</span> : null}
            </span>
          ) : null}
        </a>
      );
    },
    Tree: VeluTree as any,
    'Tree.Folder': VeluTreeFolder as any,
    'Tree.File': VeluTreeFile as any,
    View: VeluView as any,
    Icon: ({ icon, name, iconType, color, size, className }: any) => {
      const pxSize = typeof size === 'number' && Number.isFinite(size) ? size : undefined;
      const style = pxSize ? { width: `${pxSize}px`, height: `${pxSize}px` } : undefined;

      if (isValidElement(icon)) {
        const iconEl = icon as ReactElement<{ className?: string; style?: CSSProperties }>;
        return (
          <span className={['velu-inline-icon', className].filter(Boolean).join(' ')} style={style}>
            {cloneElement(iconEl, {
              className: [iconEl.props?.className, 'velu-inline-icon-svg'].filter(Boolean).join(' '),
              style: {
                ...(iconEl.props?.style ?? {}),
                ...(color ? { color } : {}),
              },
            })}
          </span>
        );
      }

      const iconName = typeof icon === 'string' ? icon : String(name ?? 'circle-help');
      return (
        <span className={['velu-inline-icon', className].filter(Boolean).join(' ')} style={style}>
          <VeluIcon name={iconName} library={iconLibrary} iconType={iconType} color={color} />
        </span>
      );
    },
    Mermaid: VeluMermaid as any,
  };
}
