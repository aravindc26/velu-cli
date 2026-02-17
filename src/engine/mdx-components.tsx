import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { type ReactNode } from 'react';
import { Accordion as FumaAccordion, Accordions as FumaAccordions } from 'fumadocs-ui/components/accordion';
import { Tab as FumaTab, Tabs as FumaTabs } from 'fumadocs-ui/components/tabs';
import { Step as FumaStep, Steps as FumaSteps } from 'fumadocs-ui/components/steps';
import { VeluIcon } from '@/components/icon';
import { VeluCodeGroup } from '@/components/code-group';
import { VeluColor, VeluColorItem, VeluColorRow } from '@/components/color';
import { getIconLibrary } from '@/lib/velu';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  const Card = defaultMdxComponents.Card as any;
  const Cards = defaultMdxComponents.Cards as any;
  const iconLibrary = getIconLibrary();
  const Callout = defaultMdxComponents.Callout as any;
  const CalloutTitle = defaultMdxComponents.CalloutTitle as any;
  const CalloutDescription = defaultMdxComponents.CalloutDescription as any;

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
    Frame: ({ children, caption, className }: any) => (
      <figure className={['velu-frame', className].filter(Boolean).join(' ')}>
        <div className="velu-frame-content">{children}</div>
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
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
    Columns: ({ children, className }: any) => (
      <div className={['velu-columns', className].filter(Boolean).join(' ')}>{children}</div>
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
    Prompt: ({ children, className }: any) => (
      <div className={['velu-prompt', className].filter(Boolean).join(' ')}>
        {children}
      </div>
    ),
    Response: ({ children, className }: any) => (
      <section className={['velu-response', className].filter(Boolean).join(' ')}>{children}</section>
    ),
    Tabs: FumaTabs as any,
    Tab: FumaTab as any,
    Steps: FumaSteps as any,
    Step: FumaStep as any,
    Expandable: ({ title, summary, children, className }: any) => (
      <details className={['velu-expandable', className].filter(Boolean).join(' ')}>
        <summary>{title ?? summary ?? 'Expand'}</summary>
        <div className="velu-expandable-content">{children}</div>
      </details>
    ),
    ParamField: ({ body, query, path, header, children, className, ...props }: any) => (
      <section className={['velu-param-field', className].filter(Boolean).join(' ')} {...props}>
        {(body || query || path || header) ? (
          <div className="velu-param-field-meta">
            {body ? <span>body</span> : null}
            {query ? <span>query</span> : null}
            {path ? <span>path</span> : null}
            {header ? <span>header</span> : null}
          </div>
        ) : null}
        {children}
      </section>
    ),
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
        <h4>Request Example</h4>
        {children}
      </section>
    ),
    ResponseField: ({ children, className, ...props }: any) => (
      <section className={['velu-response-field', className].filter(Boolean).join(' ')} {...props}>
        {children}
      </section>
    ),
    ResponseExample: ({ status, children, className, ...props }: any) => (
      <section className={['velu-response-example', className].filter(Boolean).join(' ')} {...props}>
        <h4>Response Example{status ? ` (${status})` : ''}</h4>
        {children}
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
    Update: ({ label, date, children, className }: any) => (
      <section className={['velu-update', className].filter(Boolean).join(' ')}>
        <div className="velu-update-head">{label ?? 'Update'}{date ? ` - ${date}` : ''}</div>
        {children ? <div>{children}</div> : null}
      </section>
    ),
    Tooltip: ({ tip, text, content, children, className }: any) => (
      <span
        className={['velu-tooltip', className].filter(Boolean).join(' ')}
        title={tip ?? text ?? content ?? ''}
      >
        {children}
      </span>
    ),
    Tiles: ({ children, className }: any) => (
      <div className={['velu-tiles', className].filter(Boolean).join(' ')}>{children}</div>
    ),
    Tile: ({ title, href, children, className }: any) => (
      <a href={href ?? '#'} className={['velu-tile', className].filter(Boolean).join(' ')}>
        {title ? <strong>{title}</strong> : null}
        {children ? <span>{children}</span> : null}
      </a>
    ),
    Tree: ({ children, className }: any) => (
      <div className={['velu-tree', className].filter(Boolean).join(' ')}>{children}</div>
    ),
    View: ({ children }: { children?: ReactNode }) => <>{children}</>,
    Icon: ({ icon, name, className }: any) => (
      <span className={['velu-inline-icon', className].filter(Boolean).join(' ')}>
        <VeluIcon name={String(icon ?? name ?? 'circle')} library={iconLibrary} />
      </span>
    ),
    Mermaid: ({ chart, children, className }: any) => (
      <pre className={['velu-mermaid', className].filter(Boolean).join(' ')}>
        <code>{chart ?? children}</code>
      </pre>
    ),
  };
}
