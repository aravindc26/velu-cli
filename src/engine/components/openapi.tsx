import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { createCodeSample, createOpenAPI } from 'fumadocs-openapi/server';
import { createAPIPage } from 'fumadocs-openapi/ui';
import type { HttpMethods, MethodInformation, RenderContext } from 'fumadocs-openapi';
import type { OpenAPIServer } from 'fumadocs-openapi/server';
import { Tab, Tabs, TabsList, TabsTrigger } from 'fumadocs-ui/components/tabs';
import type { ReactNode } from 'react';

const DEFAULT_SCHEMA_SOURCE = '/api-reference/openapi-example.json';
const DEFAULT_PROXY_URL = '/api/proxy';
const HTTP_METHODS = new Set<HttpMethods>(['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace']);
type SelectorMethod = HttpMethods | 'webhook';
const SELECTOR_METHODS = new Set<SelectorMethod>([...HTTP_METHODS, 'webhook']);
type VeluOpenApiLayout = 'full' | 'playground' | 'example';

type APIPageRenderer = ReturnType<typeof createAPIPage>;

interface OpenApiRenderer {
  renderer: APIPageRenderer;
  document: string;
  server: OpenAPIServer;
}

const rendererCache = new Map<string, OpenApiRenderer>();

function resolveSchemaSource(rawSource: string): string {
  const source = rawSource.trim();
  if (!source) return resolveSchemaSource(DEFAULT_SCHEMA_SOURCE);
  if (/^https?:\/\//i.test(source) || source.startsWith('file://')) return source;
  if (source.startsWith('/')) {
    const publicPath = join(process.cwd(), 'public', source.replace(/^\/+/, ''));
    if (existsSync(publicPath)) return publicPath;
    return source;
  }
  if (isAbsolute(source)) return source;

  const cwd = process.cwd();
  const candidates = [resolve(cwd, source)];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return source;
}

function normalizeMethod(value: unknown): SelectorMethod {
  const lowered = String(value ?? 'get').trim().toLowerCase() as SelectorMethod;
  return SELECTOR_METHODS.has(lowered) ? lowered : 'get';
}

function normalizeSampleId(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'curl') return 'curl';
  if (normalized === 'javascript' || normalized === 'js' || normalized === 'node') return 'js';
  if (normalized === 'python' || normalized === 'py') return 'python';
  if (normalized === 'go' || normalized === 'golang') return 'go';
  if (normalized === 'java') return 'java';
  if (normalized === 'c#' || normalized === 'csharp' || normalized === 'cs' || normalized === 'dotnet') return 'csharp';
  return undefined;
}

function buildCodeSampleOverrides(exampleLanguages?: string[], exampleAutogenerate = true) {
  const builtInIds = ['curl', 'js', 'go', 'python', 'java', 'csharp'];
  if (!exampleAutogenerate) {
    return builtInIds.map((id) => createCodeSample({ id, lang: 'text', source: false }));
  }
  if (!exampleLanguages || exampleLanguages.length === 0) return undefined;

  const selected = new Set<string>();
  for (const entry of exampleLanguages) {
    const id = normalizeSampleId(entry);
    if (id) selected.add(id);
  }
  if (selected.size === 0) {
    return builtInIds.map((id) => createCodeSample({ id, lang: 'text', source: false }));
  }
  return builtInIds
    .filter((id) => !selected.has(id))
    .map((id) => createCodeSample({ id, lang: 'text', source: false }));
}

interface RawCodeSample {
  id?: unknown;
  lang?: unknown;
  label?: unknown;
  source?: unknown;
  serverContext?: unknown;
}

interface NormalizedCodeSample {
  id: string;
  lang: string;
  label?: string;
  source: string;
  serverContext?: unknown;
}

function slugifySampleId(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function normalizeSdkCodeSamples(method: MethodInformation): ReturnType<typeof createCodeSample>[] {
  const raw = (method as unknown as { 'x-codeSamples'?: unknown })['x-codeSamples'];
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const labelCounts = new Map<string, number>();
  const normalized: NormalizedCodeSample[] = [];

  raw.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const sample = entry as RawCodeSample;
    if (typeof sample.source !== 'string' || sample.source.length === 0) return;

    const rawLang = typeof sample.lang === 'string' && sample.lang.trim().length > 0
      ? sample.lang.trim()
      : 'text';
    const label = typeof sample.label === 'string' && sample.label.trim().length > 0
      ? sample.label.trim()
      : undefined;
    const rawId = typeof sample.id === 'string' && sample.id.trim().length > 0
      ? sample.id.trim()
      : `${rawLang}-${label ?? 'sample'}-${index + 1}`;
    const id = slugifySampleId(rawId, `sample-${index + 1}`);

    if (label) labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    normalized.push({
      id,
      lang: rawLang.toLowerCase(),
      label,
      source: sample.source,
      serverContext: sample.serverContext,
    });
  });

  if (normalized.length === 0) return [];

  // prevent fumadocs fallback from re-adding raw x-codeSamples and collapsing duplicate language ids
  (method as unknown as { 'x-codeSamples'?: unknown })['x-codeSamples'] = [];

  return normalized.map((sample) => {
    const duplicateLabelCount = sample.label ? (labelCounts.get(sample.label) ?? 0) : 0;
    const resolvedLabel = sample.label && duplicateLabelCount > 1
      ? `${sample.label} (${sample.lang})`
      : sample.label;
    return createCodeSample({
      id: sample.id,
      lang: sample.lang,
      label: resolvedLabel,
      source: sample.source,
      serverContext: sample.serverContext,
    });
  });
}

function buildCodeSampleGenerator(exampleLanguages?: string[], exampleAutogenerate = true) {
  const overrides = buildCodeSampleOverrides(exampleLanguages, exampleAutogenerate);
  return (method: MethodInformation) => {
    const generated: ReturnType<typeof createCodeSample>[] = [
      ...normalizeSdkCodeSamples(method),
    ];
    if (overrides) generated.push(...overrides);
    return generated;
  };
}

interface OpenApiRenderOptions {
  exampleLanguages?: string[];
  exampleAutogenerate?: boolean;
}

interface OpenApiRecord {
  [key: string]: unknown;
}

interface NormalizedField {
  name: string;
  type?: string;
  location?: string;
  required?: boolean;
  deprecated?: boolean;
  defaultValue?: string;
  description?: string;
  depth?: number;
}

interface RichVariant {
  value: string;
  label: string;
  fields: NormalizedField[];
}

interface RichField extends NormalizedField {
  childFields?: NormalizedField[];
  childVariants?: RichVariant[];
}

function isRecord(value: unknown): value is OpenApiRecord {
  return typeof value === 'object' && value !== null;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function toRecord(value: unknown): OpenApiRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function toSchema(value: unknown): OpenApiRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function uniqueFields(fields: NormalizedField[]): NormalizedField[] {
  const seen = new Set<string>();
  const output: NormalizedField[] = [];
  for (const field of fields) {
    const key = `${field.name}::${field.type ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(field);
  }
  return output;
}

function resolveSchemaType(schema: OpenApiRecord | undefined): string {
  if (!schema) return 'any';

  if (typeof schema.$ref === 'string' && schema.$ref) {
    const ref = String(schema.$ref);
    return ref.split('/').pop() ?? ref;
  }

  const typeValue = schema.type;
  if (Array.isArray(typeValue) && typeValue.length > 0) return typeValue.map(String).join(' | ');

  if (typeof typeValue === 'string') {
    if (typeValue === 'array') {
      const itemType = resolveSchemaType(toSchema(schema.items));
      return `${itemType}[]`;
    }

    const format = typeof schema.format === 'string' && schema.format.trim().length > 0
      ? schema.format.trim()
      : '';
    return format ? `${typeValue}<${format}>` : typeValue;
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) return 'enum';
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) return 'oneOf';
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) return 'anyOf';
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) return 'allOf';
  if (isRecord(schema.properties)) return 'object';

  return 'any';
}

function stringifyDefaultValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function schemaHasNestedFields(schema: OpenApiRecord | undefined): boolean {
  if (!schema) return false;
  if (isRecord(schema.properties) && Object.keys(schema.properties).length > 0) return true;
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) return true;
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) return true;
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) return true;
  if (schema.type === 'array') {
    const items = toSchema(schema.items);
    return Boolean(items && (schemaHasNestedFields(items) || isRecord(items.properties)));
  }
  return false;
}

function collectSchemaFields(
  schema: OpenApiRecord | undefined,
  options: { prefix?: string; required?: boolean; depth?: number } = {},
  seen: WeakSet<object> = new WeakSet(),
): NormalizedField[] {
  if (!schema) return [];
  if (seen.has(schema)) return [];
  seen.add(schema);

  const compositionParts = [
    ...(Array.isArray(schema.allOf) ? schema.allOf : []),
    ...(Array.isArray(schema.oneOf) ? schema.oneOf : []),
    ...(Array.isArray(schema.anyOf) ? schema.anyOf : []),
  ]
    .map((item) => toSchema(item))
    .filter((item): item is OpenApiRecord => Boolean(item));
  if (compositionParts.length > 0) {
    const composed = compositionParts.flatMap((part) => collectSchemaFields(part, options, seen));
    if (composed.length > 0) return composed;
  }

  const depth = options.depth ?? 0;
  const fields: NormalizedField[] = [];
  const properties = toRecord(schema.properties);
  const requiredSet = new Set(asStringList(schema.required));

  if (properties) {
    for (const [rawName, rawFieldSchema] of Object.entries(properties)) {
      const fieldSchema = toSchema(rawFieldSchema);
      const fieldName = options.prefix ? `${options.prefix}.${rawName}` : rawName;
      const childRequired = requiredSet.has(rawName);
      fields.push({
        name: fieldName,
        type: resolveSchemaType(fieldSchema),
        required: childRequired,
        deprecated: Boolean(fieldSchema?.deprecated),
        defaultValue: stringifyDefaultValue(fieldSchema?.default),
        description: typeof fieldSchema?.description === 'string' ? fieldSchema.description : undefined,
        depth,
      });

      if (schemaHasNestedFields(fieldSchema)) {
        if (fieldSchema?.type === 'array') {
          const itemSchema = toSchema(fieldSchema.items);
          fields.push(...collectSchemaFields(itemSchema, {
            prefix: `${fieldName}[]`,
            required: childRequired,
            depth: depth + 1,
          }, seen));
        } else {
          fields.push(...collectSchemaFields(fieldSchema, {
            prefix: fieldName,
            required: childRequired,
            depth: depth + 1,
          }, seen));
        }
      }
    }
    return fields;
  }

  if (schema.type === 'array') {
    const itemSchema = toSchema(schema.items);
    const itemName = options.prefix ? `${options.prefix}[]` : 'items[]';
    if (itemSchema) {
      fields.push({
        name: itemName,
        type: resolveSchemaType(itemSchema),
        required: options.required,
        deprecated: Boolean(itemSchema.deprecated),
        defaultValue: stringifyDefaultValue(itemSchema.default),
        description: typeof itemSchema.description === 'string' ? itemSchema.description : undefined,
        depth,
      });

      if (schemaHasNestedFields(itemSchema)) {
        fields.push(...collectSchemaFields(itemSchema, {
          prefix: itemName,
          required: options.required,
          depth: depth + 1,
        }, seen));
      }
    }
  }

  return fields;
}

function collectResponseFields(
  schema: OpenApiRecord | undefined,
  options: { prefix?: string; depth?: number } = {},
  seen: WeakSet<object> = new WeakSet(),
): NormalizedField[] {
  if (!schema) return [];
  if (seen.has(schema)) return [];
  seen.add(schema);

  const compositionParts = [
    ...(Array.isArray(schema.allOf) ? schema.allOf : []),
    ...(Array.isArray(schema.oneOf) ? schema.oneOf : []),
    ...(Array.isArray(schema.anyOf) ? schema.anyOf : []),
  ]
    .map((item) => toSchema(item))
    .filter((item): item is OpenApiRecord => Boolean(item));
  if (compositionParts.length > 0) {
    const composed = compositionParts.flatMap((part) => collectResponseFields(part, options, seen));
    if (composed.length > 0) return composed;
  }

  const depth = options.depth ?? 0;
  const prefix = options.prefix;
  const properties = toRecord(schema.properties);
  const requiredSet = new Set(asStringList(schema.required));
  const fields: NormalizedField[] = [];

  if (properties && Object.keys(properties).length > 0) {
    for (const [rawName, rawChild] of Object.entries(properties)) {
      const child = toSchema(rawChild);
      const fieldName = prefix ? `${prefix}.${rawName}` : rawName;
      const childRequired = requiredSet.has(rawName);
      fields.push({
        name: fieldName,
        type: resolveSchemaType(child),
        required: childRequired,
        deprecated: Boolean(child?.deprecated),
        defaultValue: stringifyDefaultValue(child?.default),
        description: typeof child?.description === 'string' ? child.description : undefined,
        depth,
      });

      if (child?.type === 'array') {
        const itemSchema = toSchema(child.items);
        if (itemSchema && (isRecord(itemSchema.properties) || itemSchema.type === 'array')) {
          fields.push(...collectResponseFields(itemSchema, { prefix: fieldName, depth: depth + 1 }, seen));
        }
        continue;
      }

      if (child && isRecord(child.properties)) {
        fields.push(...collectResponseFields(child, { prefix: fieldName, depth: depth + 1 }, seen));
      }
    }
    return fields;
  }

  if (schema.type === 'array') {
    const itemSchema = toSchema(schema.items);
    return collectResponseFields(itemSchema, { prefix, depth }, seen);
  }

  return fields;
}

function richVariantFields(schema: OpenApiRecord | undefined): NormalizedField[] {
  if (!schema) return [];
  const fields = collectSchemaFields(schema);
  return uniqueFields(fields);
}

function buildRichField(name: string, schema: OpenApiRecord | undefined, required = false): RichField {
  const field: RichField = {
    name,
    type: resolveSchemaType(schema),
    required,
    deprecated: Boolean(schema?.deprecated),
    defaultValue: stringifyDefaultValue(schema?.default),
    description: typeof schema?.description === 'string' ? schema.description : undefined,
  };

  if (!schema) return field;

  const oneOf = Array.isArray(schema.oneOf) ? schema.oneOf : [];
  const anyOf = Array.isArray(schema.anyOf) ? schema.anyOf : [];
  if (oneOf.length > 0 || anyOf.length > 0) {
    const variants = (oneOf.length > 0 ? oneOf : anyOf)
      .map((item, index) => {
        const subSchema = toSchema(item);
        if (!subSchema) return null;
        const label = typeof subSchema.title === 'string' && subSchema.title.trim().length > 0
          ? subSchema.title.trim()
          : `Option ${index + 1}`;
        const fields = richVariantFields(subSchema);
        return {
          value: `variant-${index + 1}`,
          label,
          fields,
        } satisfies RichVariant;
      })
      .filter((variant): variant is RichVariant => Boolean(variant));
    if (variants.length > 0) field.childVariants = variants;
    return field;
  }

  const allOf = Array.isArray(schema.allOf) ? schema.allOf : [];
  if (allOf.length > 0) {
    const merged = uniqueFields(
      allOf.flatMap((item) => richVariantFields(toSchema(item))),
    );
    if (merged.length > 0) field.childFields = merged;
    return field;
  }

  if (schema.type === 'array') {
    const itemSchema = toSchema(schema.items);
    const childFields = richVariantFields(itemSchema);
    if (childFields.length > 0) field.childFields = childFields;
    return field;
  }

  if (isRecord(schema.properties)) {
    const childFields = uniqueFields(collectSchemaFields(schema));
    if (childFields.length > 0) field.childFields = childFields;
  }

  return field;
}

function buildRichFieldsFromSchema(schema: OpenApiRecord | undefined, requiredFallback = false): RichField[] {
  if (!schema) return [];

  const rootOneOf = Array.isArray(schema.oneOf) ? schema.oneOf : [];
  const rootAnyOf = Array.isArray(schema.anyOf) ? schema.anyOf : [];
  if (rootOneOf.length > 0 || rootAnyOf.length > 0) {
    const variants = (rootOneOf.length > 0 ? rootOneOf : rootAnyOf)
      .map((item, index) => {
        const subSchema = toSchema(item);
        if (!subSchema) return null;
        const label = typeof subSchema.title === 'string' && subSchema.title.trim().length > 0
          ? subSchema.title.trim()
          : `Option ${index + 1}`;
        return {
          value: `variant-${index + 1}`,
          label,
          fields: richVariantFields(subSchema),
        } satisfies RichVariant;
      })
      .filter((variant): variant is RichVariant => Boolean(variant));
    if (variants.length > 0) {
      return [{
        name: 'value',
        type: resolveSchemaType(schema),
        required: requiredFallback,
        deprecated: Boolean(schema.deprecated),
        defaultValue: stringifyDefaultValue(schema.default),
        description: typeof schema.description === 'string' ? schema.description : undefined,
        childVariants: variants,
      }];
    }
  }

  const rootAllOf = Array.isArray(schema.allOf) ? schema.allOf : [];
  if (rootAllOf.length > 0) {
    const merged = uniqueFields(
      rootAllOf.flatMap((item) => collectSchemaFields(toSchema(item), { required: requiredFallback })),
    );
    if (merged.length > 0) return merged;
  }

  const properties = toRecord(schema.properties);
  const requiredSet = new Set(asStringList(schema.required));
  if (properties && Object.keys(properties).length > 0) {
    const entries = Object.entries(properties).map(([name, value]) => {
      const childSchema = toSchema(value);
      return buildRichField(name, childSchema, requiredSet.has(name));
    });
    return entries;
  }

  if (schema.type === 'array') {
    const itemSchema = toSchema(schema.items);
    if (itemSchema && isRecord(itemSchema.properties)) {
      const fields = buildRichFieldsFromSchema(itemSchema, requiredFallback);
      if (fields.length > 0) return fields;
    }
  }

  return [{
    name: 'value',
    type: resolveSchemaType(schema),
    required: requiredFallback,
    deprecated: Boolean(schema.deprecated),
    defaultValue: stringifyDefaultValue(schema.default),
    description: typeof schema.description === 'string' ? schema.description : undefined,
  }];
}

function renderAnchor(anchorId: string, label: string): ReactNode {
  return (
    <a className="velu-param-anchor" href={`#${anchorId}`} aria-label={`Anchor for ${label}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </a>
  );
}

function fieldAnchorId(prefix: string, name: string): string {
  const clean = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${prefix}-${clean || 'field'}`;
}

function renderParamField(field: NormalizedField, ctx: RenderContext, location: string): ReactNode {
  const anchorId = fieldAnchorId(`param-${location}`, field.name);
  const depthClass = field.depth && field.depth > 0 ? `velu-openapi-field-depth-${Math.min(field.depth, 4)}` : '';
  return (
    <section id={anchorId} className={['velu-param-field-item', depthClass].filter(Boolean).join(' ')}>
      <div className="velu-param-head">
        {renderAnchor(anchorId, field.name)}
        <code>{field.name}</code>
        {field.type ? <span className="velu-pill velu-pill-type">{field.type}</span> : null}
        {field.location ? <span className="velu-pill velu-pill-type">{field.location}</span> : null}
        {field.required ? <span className="velu-pill velu-pill-required">required</span> : null}
        {field.deprecated ? <span className="velu-pill velu-pill-deprecated">deprecated</span> : null}
        {field.defaultValue ? <em>default: {field.defaultValue}</em> : null}
      </div>
      {field.description ? <div className="velu-param-body">{ctx.renderMarkdown(field.description)}</div> : null}
    </section>
  );
}

function renderResponseField(field: NormalizedField, ctx: RenderContext, suffix: string): ReactNode {
  const anchorId = fieldAnchorId(`response-${suffix}`, field.name);
  const depthClass = field.depth && field.depth > 0 ? `velu-openapi-field-depth-${Math.min(field.depth, 4)}` : '';
  return (
    <section id={anchorId} className={['velu-response-field-item', depthClass].filter(Boolean).join(' ')}>
      <div className="velu-property-head">
        {renderAnchor(anchorId, field.name)}
        <code>{field.name}</code>
        {field.type ? <span className="velu-pill velu-pill-type">{field.type}</span> : null}
        {field.required ? <span className="velu-pill velu-pill-required">required</span> : null}
        {field.deprecated ? <span className="velu-pill velu-pill-deprecated">deprecated</span> : null}
        {field.defaultValue ? <em>default: {field.defaultValue}</em> : null}
      </div>
      {field.description ? <div className="velu-property-body">{ctx.renderMarkdown(field.description)}</div> : null}
    </section>
  );
}

function renderParamFieldWithChildren(field: RichField, ctx: RenderContext, location: string): ReactNode {
  const hasChildren = (field.childFields?.length ?? 0) > 0 || (field.childVariants?.length ?? 0) > 0;
  return (
    <div className="velu-openapi-complex-field">
      {renderParamField(field, ctx, location)}
      {hasChildren ? (
        <details className="velu-openapi-child-attrs" open>
          <summary className="velu-openapi-child-attrs-summary">Hide child attributes</summary>
          {field.childVariants && field.childVariants.length > 0 ? (
            <Tabs
              defaultValue={field.childVariants[0]?.value}
              className="velu-openapi-child-variants !border-0 !rounded-none !bg-transparent !my-0 !overflow-visible"
            >
              <TabsList className="velu-openapi-child-variant-list !px-0 !gap-1 !overflow-visible">
                {field.childVariants.map((variant) => (
                  <TabsTrigger
                    key={`${location}-${field.name}-${variant.value}`}
                    value={variant.value}
                    className="velu-openapi-child-variant-trigger"
                  >
                    {variant.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {field.childVariants.map((variant) => (
                <Tab
                  key={`${location}-${field.name}-${variant.value}-panel`}
                  value={variant.value}
                  className="velu-openapi-response-panel !p-0 !bg-transparent !rounded-none"
                >
                  <div className="velu-openapi-field-list">
                    {variant.fields.map((childField) => (
                      <div key={`${location}-${field.name}-${variant.value}-${childField.name}`}>
                        {renderParamField(childField, ctx, `${location}-${field.name}-${variant.value}`)}
                      </div>
                    ))}
                  </div>
                </Tab>
              ))}
            </Tabs>
          ) : (
            <div className="velu-openapi-field-list">
              {(field.childFields ?? []).map((childField) => (
                <div key={`${location}-${field.name}-${childField.name}`}>
                  {renderParamField(childField, ctx, `${location}-${field.name}`)}
                </div>
              ))}
            </div>
          )}
        </details>
      ) : null}
    </div>
  );
}

function renderResponseFieldWithChildren(field: RichField, ctx: RenderContext, suffix: string): ReactNode {
  const hasChildren = (field.childFields?.length ?? 0) > 0 || (field.childVariants?.length ?? 0) > 0;
  return (
    <div className="velu-openapi-complex-field">
      {renderResponseField(field, ctx, suffix)}
      {hasChildren ? (
        <details className="velu-openapi-child-attrs" open>
          <summary className="velu-openapi-child-attrs-summary">Hide child attributes</summary>
          {field.childVariants && field.childVariants.length > 0 ? (
            <Tabs
              defaultValue={field.childVariants[0]?.value}
              className="velu-openapi-child-variants !border-0 !rounded-none !bg-transparent !my-0 !overflow-visible"
            >
              <TabsList className="velu-openapi-child-variant-list !px-0 !gap-1 !overflow-visible">
                {field.childVariants.map((variant) => (
                  <TabsTrigger
                    key={`${suffix}-${field.name}-${variant.value}`}
                    value={variant.value}
                    className="velu-openapi-child-variant-trigger"
                  >
                    {variant.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {field.childVariants.map((variant) => (
                <Tab
                  key={`${suffix}-${field.name}-${variant.value}-panel`}
                  value={variant.value}
                  className="velu-openapi-response-panel !p-0 !bg-transparent !rounded-none"
                >
                  <div className="velu-openapi-field-list">
                    {variant.fields.map((childField) => (
                      <div key={`${suffix}-${field.name}-${variant.value}-${childField.name}`}>
                        {renderResponseField(childField, ctx, `${suffix}-${field.name}-${variant.value}`)}
                      </div>
                    ))}
                  </div>
                </Tab>
              ))}
            </Tabs>
          ) : (
            <div className="velu-openapi-field-list">
              {(field.childFields ?? []).map((childField) => (
                <div key={`${suffix}-${field.name}-${childField.name}`}>
                  {renderResponseField(childField, ctx, `${suffix}-${field.name}`)}
                </div>
              ))}
            </div>
          )}
        </details>
      ) : null}
    </div>
  );
}

function parameterSchema(parameter: OpenApiRecord): OpenApiRecord | undefined {
  const direct = toSchema(parameter.schema);
  if (direct) return direct;

  const content = toRecord(parameter.content);
  if (!content) return undefined;
  for (const rawMedia of Object.values(content)) {
    const media = toRecord(rawMedia);
    const schema = toSchema(media?.schema);
    if (schema) return schema;
  }
  return undefined;
}

function headerObjectSchema(headerObject: OpenApiRecord): OpenApiRecord | undefined {
  const direct = toSchema(headerObject.schema);
  if (direct) return direct;

  const content = toRecord(headerObject.content);
  if (!content) return undefined;
  for (const rawMedia of Object.values(content)) {
    const media = toRecord(rawMedia);
    const schema = toSchema(media?.schema);
    if (schema) return schema;
  }
  return undefined;
}

function collectResponseHeaderFields(response: OpenApiRecord): NormalizedField[] {
  const headers = toRecord(response.headers);
  if (!headers) return [];

  const fields: NormalizedField[] = [];
  for (const [headerName, rawHeader] of Object.entries(headers)) {
    const headerObject = toRecord(rawHeader);
    if (!headerObject) continue;

    const schema = headerObjectSchema(headerObject);
    const description = typeof headerObject.description === 'string'
      ? headerObject.description
      : (typeof schema?.description === 'string' ? schema.description : undefined);

    fields.push({
      name: headerName,
      type: resolveSchemaType(schema),
      required: Boolean(headerObject.required),
      deprecated: Boolean(headerObject.deprecated ?? schema?.deprecated),
      defaultValue: stringifyDefaultValue(schema?.default),
      description,
    } satisfies NormalizedField);
  }
  return fields;
}

function renderAuthorizationSection(method: MethodInformation, ctx: RenderContext): ReactNode {
  const schemaRoot = toRecord((ctx.schema as unknown as OpenApiRecord)?.dereferenced);
  const securitySchemes = toRecord(toRecord(schemaRoot?.components)?.securitySchemes);
  const securityEntries = Array.isArray(method.security) && method.security.length > 0
    ? method.security
    : (Array.isArray(schemaRoot?.security) ? schemaRoot.security : []);

  const fields: Array<NormalizedField & { location: string }> = [];
  for (const rawSecurity of securityEntries) {
    const security = toRecord(rawSecurity);
    if (!security) continue;

    for (const [schemeId, rawScopes] of Object.entries(security)) {
      const scheme = toRecord(securitySchemes?.[schemeId]);
      if (!scheme) continue;

      const scopes = asStringList(rawScopes);
      const schemeDescription = typeof scheme.description === 'string' ? scheme.description : '';
      const scopeDescription = scopes.length > 0 ? `Scopes: ${scopes.join(', ')}` : '';
      const combinedDescription = [schemeDescription, scopeDescription].filter(Boolean).join('\n\n');
      const deprecated = Boolean(scheme.deprecated);

      if (scheme.type === 'apiKey') {
        const inLocation = typeof scheme.in === 'string' ? scheme.in : 'header';
        const fallbackDescription = `API key sent via \`${inLocation}\` as \`${typeof scheme.name === 'string' && scheme.name ? scheme.name : schemeId}\`.`;
        fields.push({
          location: inLocation,
          name: typeof scheme.name === 'string' && scheme.name ? scheme.name : schemeId,
          type: 'string',
          required: true,
          deprecated,
          description: combinedDescription || fallbackDescription,
        });
        continue;
      }

      if (scheme.type === 'http') {
        const httpScheme = typeof scheme.scheme === 'string' ? scheme.scheme.toLowerCase() : '';
        const fallbackDescription = httpScheme === 'basic'
          ? 'Basic authentication header with base64-encoded credentials.'
          : 'Bearer authentication header of the form `Bearer <token>`, where `<token>` is your auth token.';
        fields.push({
          location: 'header',
          name: 'Authorization',
          type: 'string',
          required: true,
          deprecated,
          description: combinedDescription || fallbackDescription,
        });
        continue;
      }

      if (scheme.type === 'oauth2' || scheme.type === 'openIdConnect') {
        fields.push({
          location: 'header',
          name: 'Authorization',
          type: 'string',
          required: true,
          deprecated,
          description: combinedDescription || 'Bearer authentication header of the form `Bearer <token>`, where `<token>` is your auth token.',
        });
      }
    }
  }

  if (fields.length === 0) return null;

  return (
    <section className="velu-openapi-section velu-openapi-parameter-group velu-openapi-auth-section">
      {ctx.renderHeading(2, 'Authorizations')}
      <div className="velu-openapi-field-list">
        {fields.map((field, index) => (
          <div key={`${field.location}-${field.name}-${index}`}>
            {renderParamField(field, ctx, `auth-${field.location}`)}
          </div>
        ))}
      </div>
    </section>
  );
}

function renderParameterSections(method: MethodInformation, ctx: RenderContext): ReactNode {
  const parameters = Array.isArray(method.parameters) ? method.parameters : [];
  if (parameters.length === 0) return null;

  const sections: Array<{ title: string; location: string; fields: NormalizedField[] }> = [];
  const order: Array<{ key: string; title: string }> = [
    { key: 'path', title: 'Path Parameters' },
    { key: 'query', title: 'Query Parameters' },
    { key: 'header', title: 'Request Headers' },
    { key: 'cookie', title: 'Cookie Parameters' },
  ];

  for (const item of order) {
    const fields = parameters
      .map((raw) => toRecord(raw))
      .filter((parameter): parameter is OpenApiRecord => Boolean(parameter && parameter.in === item.key))
      .map((parameter) => {
        const schema = parameterSchema(parameter);
        const description = typeof parameter.description === 'string'
          ? parameter.description
          : (typeof schema?.description === 'string' ? schema.description : undefined);
        return {
          name: typeof parameter.name === 'string' ? parameter.name : item.key,
          type: resolveSchemaType(schema),
          required: Boolean(parameter.required),
          deprecated: Boolean(parameter.deprecated ?? schema?.deprecated),
          defaultValue: stringifyDefaultValue(schema?.default),
          description,
        } satisfies NormalizedField;
      });

    if (fields.length > 0) {
      sections.push({ title: item.title, location: item.key, fields });
    }
  }

  if (sections.length === 0) return null;

  return (
    <section className="velu-openapi-section">
      {sections.map((section) => (
        <div key={section.location} className="velu-openapi-field-group velu-openapi-parameter-group">
          {ctx.renderHeading(2, section.title)}
          <div className="velu-openapi-field-list">
            {section.fields.map((field) => (
              <div key={`${section.location}-${field.name}`}>
                {renderParamField(field, ctx, section.location)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function renderRequestBodySection(method: MethodInformation, ctx: RenderContext): ReactNode {
  const requestBody = toRecord(method.requestBody);
  const content = toRecord(requestBody?.content);
  if (!content || Object.keys(content).length === 0) return null;

  const mediaSections: Array<{ mediaType: string; fields: RichField[]; description?: string }> = [];
  for (const [mediaType, rawMedia] of Object.entries(content)) {
    const media = toRecord(rawMedia);
    const schema = toSchema(media?.schema);
    if (!schema) continue;
    const fields = buildRichFieldsFromSchema(schema, Boolean(requestBody?.required));
    mediaSections.push({
      mediaType,
      fields,
      description: typeof requestBody?.description === 'string' ? requestBody.description : undefined,
    });
  }

  if (mediaSections.length === 0) return null;

  const orderedMediaSections = mediaSections.map((section) => {
    const withIndex = section.fields.map((field, index) => ({ field, index }));
    withIndex.sort((a, b) => {
      const aRequired = a.field.required ? 1 : 0;
      const bRequired = b.field.required ? 1 : 0;
      if (aRequired !== bRequired) return bRequired - aRequired;
      return a.index - b.index;
    });
    return {
      ...section,
      fields: withIndex.map((item) => item.field),
    };
  });

  return (
    <section className="velu-openapi-section velu-openapi-parameter-group velu-openapi-body-section">
      {orderedMediaSections.length === 1 ? (
        <>
          <div className="velu-openapi-body-header">
            {ctx.renderHeading(2, 'Body')}
            <span className="velu-openapi-body-content-type">{orderedMediaSections[0].mediaType}</span>
          </div>
          {orderedMediaSections[0].description ? (
            <div className="velu-openapi-field-description">{ctx.renderMarkdown(orderedMediaSections[0].description)}</div>
          ) : null}
          <div className="velu-openapi-field-list">
            {orderedMediaSections[0].fields.map((field) => (
              <div key={`${orderedMediaSections[0].mediaType}-${field.name}`}>
                {renderParamFieldWithChildren(field, ctx, 'body')}
              </div>
            ))}
          </div>
        </>
      ) : (
        <Tabs defaultValue={orderedMediaSections[0]?.mediaType} className="velu-openapi-body-tabs !border-0 !rounded-none !bg-transparent !my-0 !overflow-visible">
          <div className="velu-openapi-body-header">
            {ctx.renderHeading(2, 'Body')}
            <TabsList className="velu-openapi-body-media-list !px-0 !gap-1 !overflow-visible">
              {orderedMediaSections.map((mediaSection) => (
                <TabsTrigger
                  key={`body-media-${mediaSection.mediaType}`}
                  value={mediaSection.mediaType}
                  className="velu-openapi-body-media-trigger"
                >
                  {mediaSection.mediaType}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {orderedMediaSections.map((mediaSection) => (
            <Tab
              key={`body-panel-${mediaSection.mediaType}`}
              value={mediaSection.mediaType}
              className="velu-openapi-response-panel !p-0 !bg-transparent !rounded-none"
            >
              {mediaSection.description ? <div className="velu-openapi-field-description">{ctx.renderMarkdown(mediaSection.description)}</div> : null}
              <div className="velu-openapi-field-list">
                {mediaSection.fields.map((field) => (
                  <div key={`${mediaSection.mediaType}-${field.name}`}>
                    {renderParamFieldWithChildren(field, ctx, 'body')}
                  </div>
                ))}
              </div>
            </Tab>
          ))}
        </Tabs>
      )}
    </section>
  );
}

interface ResponseExampleEntry {
  tabValue: string;
  label: string;
  description?: string;
  code: string;
}

interface ResponseMediaEntry {
  mediaType?: string;
  tabValue: string;
  fields: RichField[];
  isEmpty: boolean;
  examples: ResponseExampleEntry[];
}

function mediaTypeToCodeLang(mediaType?: string): string {
  const value = String(mediaType ?? '').toLowerCase();
  if (value.includes('json')) return 'json';
  if (value.includes('xml')) return 'xml';
  if (value.includes('yaml') || value.includes('yml')) return 'yaml';
  if (value.includes('html')) return 'html';
  return 'text';
}

function stringifyExampleCode(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function collectResponseExamples(media: OpenApiRecord): ResponseExampleEntry[] {
  const entries: ResponseExampleEntry[] = [];
  const examples = toRecord(media.examples);

  if (examples) {
    let index = 0;
    for (const [name, rawExample] of Object.entries(examples)) {
      index += 1;

      if (isRecord(rawExample) && typeof rawExample.$ref === 'string') continue;

      const example = toRecord(rawExample);
      const value = example ? (example.value ?? undefined) : rawExample;
      if (value === undefined) continue;

      const label = example && typeof example.summary === 'string' && example.summary.trim().length > 0
        ? example.summary.trim()
        : name;
      const description = example && typeof example.description === 'string' && example.description.trim().length > 0
        ? example.description.trim()
        : undefined;

      entries.push({
        tabValue: `example-${index}`,
        label,
        description,
        code: stringifyExampleCode(value),
      });
    }
  }

  if (entries.length === 0 && media.example !== undefined) {
    entries.push({
      tabValue: 'example-default',
      label: 'Example',
      code: stringifyExampleCode(media.example),
    });
  }

  return entries;
}

function renderResponseExamples(
  examples: ResponseExampleEntry[],
  mediaType: string | undefined,
  ctx: RenderContext,
  scopeKey: string,
): ReactNode {
  if (examples.length === 0) return null;

  const codeLang = mediaTypeToCodeLang(mediaType);

  if (examples.length === 1) {
    const example = examples[0];
    return (
      <div className="velu-openapi-response-examples">
        {example.description ? (
          <div className="velu-openapi-field-description">{ctx.renderMarkdown(example.description)}</div>
        ) : null}
        <div className="velu-openapi-response-example-code">{ctx.renderCodeBlock(codeLang, example.code)}</div>
      </div>
    );
  }

  return (
    <Tabs
      defaultValue={examples[0]?.tabValue}
      className="velu-openapi-response-example-tabs !border-0 !rounded-none !bg-transparent !my-0 !overflow-visible"
    >
      <div className="velu-openapi-response-example-switch-header">
        <TabsList className="velu-openapi-response-example-list !px-0 !gap-1 !overflow-visible">
          {examples.map((example) => (
            <TabsTrigger
              key={`${scopeKey}-${example.tabValue}`}
              value={example.tabValue}
              className="velu-openapi-response-example-trigger"
            >
              {example.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {examples.map((example) => (
        <Tab
          key={`${scopeKey}-${example.tabValue}-panel`}
          value={example.tabValue}
          className="velu-openapi-response-panel !p-0 !bg-transparent !rounded-none"
        >
          {example.description ? (
            <div className="velu-openapi-field-description">{ctx.renderMarkdown(example.description)}</div>
          ) : null}
          <div className="velu-openapi-response-example-code">{ctx.renderCodeBlock(codeLang, example.code)}</div>
        </Tab>
      ))}
    </Tabs>
  );
}

function renderResponseMediaContent(
  media: ResponseMediaEntry,
  ctx: RenderContext,
  suffix: string,
): ReactNode {
  const exampleBlock = renderResponseExamples(media.examples, media.mediaType, ctx, suffix);
  const fieldsBlock = media.isEmpty ? null : (
    <div className="velu-openapi-field-list">
      {media.fields.map((field) => (
        <div key={`${suffix}-${field.name}`}>
          {renderResponseFieldWithChildren(field, ctx, suffix)}
        </div>
      ))}
    </div>
  );

  if (exampleBlock && fieldsBlock) {
    return (
      <>
        {exampleBlock}
        {fieldsBlock}
      </>
    );
  }

  if (exampleBlock) return exampleBlock;
  if (fieldsBlock) return fieldsBlock;
  return <div className="velu-openapi-response-empty">Empty</div>;
}

function responseSortKey(status: string): number {
  const num = Number(status);
  return Number.isFinite(num) ? num : Number.MAX_SAFE_INTEGER;
}

function renderResponsesSection(method: MethodInformation, ctx: RenderContext): ReactNode {
  const responses = toRecord(method.responses);
  if (!responses) return null;
  const statuses = Object.keys(responses).sort((a, b) => responseSortKey(a) - responseSortKey(b) || a.localeCompare(b));
  if (statuses.length === 0) return null;

  const statusEntries = statuses.map((status) => {
    const response = toRecord(responses[status]);
    const content = toRecord(response?.content);
    const responseDescription = typeof response?.description === 'string' ? response.description : undefined;
    const responseHeaders = response ? collectResponseHeaderFields(response) : [];
    const mediaEntries: ResponseMediaEntry[] = (content ? Object.entries(content) : [])
      .map(([mediaType, rawMedia]) => {
        const media = toRecord(rawMedia);
        const schema = toSchema(media?.schema);
        const fields = buildRichFieldsFromSchema(schema);
        const isEmpty = !schema;
        const examples = media ? collectResponseExamples(media) : [];

        return {
          mediaType,
          tabValue: mediaType,
          fields,
          isEmpty,
          examples,
        };
      });

    if (mediaEntries.length === 0) {
      mediaEntries.push({
        mediaType: undefined,
        tabValue: '__default',
        fields: [],
        isEmpty: true,
        examples: [],
      });
    }

    return {
      status,
      responseDescription,
      responseHeaders,
      mediaEntries,
    };
  });

  const mediaTypeSet = new Set(
    statusEntries
      .flatMap((entry) => entry.mediaEntries.map((media) => media.mediaType))
      .filter((mediaType): mediaType is string => typeof mediaType === 'string' && mediaType.length > 0),
  );
  const staticMediaType = mediaTypeSet.size === 1 ? Array.from(mediaTypeSet)[0] : undefined;

  return (
    <section className="velu-openapi-section velu-openapi-response-section">
      <Tabs defaultValue={statusEntries[0]?.status} className="velu-openapi-response-tabs !border-0 !rounded-none !bg-transparent !my-0 !overflow-visible">
        <div className="velu-openapi-response-header">
          {ctx.renderHeading(2, 'Response')}
          <div className="velu-openapi-response-controls">
            <TabsList className="velu-openapi-response-status-list !px-0 !gap-1 !overflow-visible">
              {statusEntries.map((entry) => (
                <TabsTrigger
                  key={`status-${entry.status}`}
                  value={entry.status}
                  className="velu-openapi-response-status-trigger"
                >
                  {entry.status}
                </TabsTrigger>
              ))}
            </TabsList>
            {staticMediaType ? (
              <span className="velu-openapi-response-content-type">{staticMediaType}</span>
            ) : null}
          </div>
        </div>

        {statusEntries.map((entry) => (
          <Tab
            key={entry.status}
            value={entry.status}
            className="velu-openapi-response-panel !p-0 !bg-transparent !rounded-none"
          >
            <div className="velu-openapi-response-group">
              {entry.responseDescription ? (
                <div className="velu-openapi-response-head">
                  <div className="velu-openapi-field-description">{ctx.renderMarkdown(entry.responseDescription)}</div>
                </div>
              ) : null}

              {entry.responseHeaders.length > 0 ? (
                <div className="velu-openapi-response-headers">
                  {ctx.renderHeading(3, 'Response Headers')}
                  <div className="velu-openapi-field-list">
                    {entry.responseHeaders.map((field) => (
                      <div key={`${entry.status}-header-${field.name}`}>
                        {renderResponseField(field, ctx, `${entry.status}-header`)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {entry.mediaEntries.length > 1 ? (
                <Tabs
                  defaultValue={entry.mediaEntries[0]?.tabValue}
                  className="velu-openapi-response-media-switch !border-0 !rounded-none !bg-transparent !my-0 !overflow-visible"
                >
                  <div className="velu-openapi-response-media-switch-header">
                    <TabsList className="velu-openapi-response-media-list !px-0 !gap-1 !overflow-visible">
                      {entry.mediaEntries.map((media) => (
                        <TabsTrigger
                          key={`${entry.status}-${media.tabValue}`}
                          value={media.tabValue}
                          className="velu-openapi-response-media-trigger"
                        >
                          {media.mediaType ?? 'default'}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  {entry.mediaEntries.map((media) => (
                    <Tab
                      key={`${entry.status}-${media.tabValue}-panel`}
                      value={media.tabValue}
                      className="velu-openapi-response-panel !p-0 !bg-transparent !rounded-none"
                    >
                      {renderResponseMediaContent(media, ctx, `${entry.status}-${media.tabValue}`)}
                    </Tab>
                  ))}
                </Tabs>
              ) : (
                renderResponseMediaContent(entry.mediaEntries[0], ctx, `${entry.status}`)
              )}
            </div>
          </Tab>
        ))}
      </Tabs>
    </section>
  );
}

function createRendererForLayout(
  server: OpenAPIServer,
  layout: VeluOpenApiLayout,
  options: OpenApiRenderOptions,
): APIPageRenderer {
  const generateCodeSamples = buildCodeSampleGenerator(
    options.exampleLanguages,
    options.exampleAutogenerate !== false,
  );
  const apiPageOptions = { generateCodeSamples };

  if (layout === 'full') return createAPIPage(server, apiPageOptions);

  if (layout === 'playground') {
    return createAPIPage(server, {
      ...apiPageOptions,
      content: {
        renderOperationLayout: async (slots, ctx, method) => (
          <div className="velu-openapi-operation-layout">
            {slots.header}
            {slots.apiPlayground}
            {slots.description}
            {renderAuthorizationSection(method as MethodInformation, ctx)}
            {renderParameterSections(method as MethodInformation, ctx)}
            {renderRequestBodySection(method as MethodInformation, ctx)}
            {renderResponsesSection(method as MethodInformation, ctx)}
            {slots.callbacks}
            <div className="velu-openapi-example-source" data-velu-openapi-example-source="true">
              {slots.apiExample}
            </div>
          </div>
        ),
      },
    });
  }

  return createAPIPage(server, {
    ...apiPageOptions,
    content: {
      renderOperationLayout: async (slots) => {
        return slots.apiExample;
      },
    },
  });
}

function getRenderer(
  schemaSource: string,
  proxyUrl: string | undefined,
  layout: VeluOpenApiLayout,
  options: OpenApiRenderOptions,
): OpenApiRenderer {
  const cacheKey = `${proxyUrl ?? 'direct'}::${layout}::${options.exampleAutogenerate !== false ? 'auto' : 'manual'}::${(options.exampleLanguages ?? []).join(',')}::${schemaSource}`;
  const cached = rendererCache.get(cacheKey);
  if (cached) return cached;

  const server = createOpenAPI({
    input: [schemaSource],
    ...(proxyUrl ? { proxyUrl } : {}),
  });
  const renderer = createRendererForLayout(server, layout, options);
  const nextValue: OpenApiRenderer = {
    renderer,
    document: schemaSource,
    server,
  };
  rendererCache.set(cacheKey, nextValue);
  return nextValue;
}

function getInlineRenderer(
  inlineDocumentId: string,
  inlineDocument: Record<string, unknown>,
  proxyUrl: string | undefined,
  layout: VeluOpenApiLayout,
  options: OpenApiRenderOptions,
): OpenApiRenderer {
  const cacheKey = `${proxyUrl ?? 'direct'}::inline::${layout}::${options.exampleAutogenerate !== false ? 'auto' : 'manual'}::${(options.exampleLanguages ?? []).join(',')}::${inlineDocumentId}`;
  const cached = rendererCache.get(cacheKey);
  if (cached) return cached;

  const server = createOpenAPI({
    input: async () => ({
      [inlineDocumentId]: inlineDocument,
    }),
    ...(proxyUrl ? { proxyUrl } : {}),
  });
  const renderer = createRendererForLayout(server, layout, options);
  const nextValue: OpenApiRenderer = {
    renderer,
    document: inlineDocumentId,
    server,
  };
  rendererCache.set(cacheKey, nextValue);
  return nextValue;
}

interface VeluOpenAPIProps {
  schemaSource?: string;
  inlineDocument?: Record<string, unknown>;
  inlineDocumentId?: string;
  layout?: VeluOpenApiLayout;
  endpoint?: string;
  method?: unknown;
  proxyUrl?: string;
  exampleLanguages?: string[];
  exampleAutogenerate?: boolean;
  className?: string;
  showTitle?: boolean;
  showDescription?: boolean;
}

interface ResolvedOperation {
  path: string;
  method: HttpMethods;
}

interface ResolvedWebhook {
  name: string;
  method: HttpMethods;
}

interface ResolvedTargetOperation {
  type: 'operation';
  item: ResolvedOperation;
}

interface ResolvedTargetWebhook {
  type: 'webhook';
  item: ResolvedWebhook;
}

type ResolvedTarget = ResolvedTargetOperation | ResolvedTargetWebhook;

function pickWebhookMethod(pathItem: Record<string, unknown>): HttpMethods | null {
  for (const method of HTTP_METHODS) {
    if (pathItem[method]) return method;
  }
  return null;
}

function resolveOperation(schema: any, endpoint: string, method: HttpMethods): ResolvedOperation | null {
  const paths = schema?.dereferenced?.paths;
  if (!paths || typeof paths !== 'object') return null;

  const exact = paths[endpoint];
  if (exact && typeof exact === 'object' && exact[method]) {
    return { path: endpoint, method };
  }

  const entries = Object.entries(paths) as Array<[string, Record<string, unknown>]>;
  const sameMethod = entries.find(([, pathItem]) => Boolean(pathItem?.[method]));
  if (sameMethod) {
    return { path: sameMethod[0], method };
  }

  for (const [pathKey, pathItem] of entries) {
    for (const methodKey of HTTP_METHODS) {
      if (pathItem?.[methodKey]) return { path: pathKey, method: methodKey };
    }
  }

  return null;
}

function normalizeWebhookName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  return `/${trimmed}`;
}

function resolveWebhook(schema: any, endpoint: string): ResolvedWebhook | null {
  const webhooks = schema?.dereferenced?.webhooks;
  if (!webhooks || typeof webhooks !== 'object') return null;

  const webhookEntries = Object.entries(webhooks) as Array<[string, Record<string, unknown>]>;
  if (webhookEntries.length === 0) return null;

  const normalizedTarget = normalizeWebhookName(endpoint);
  const exactMatch = webhookEntries.find(([name]) => name === endpoint || name === normalizedTarget);
  if (exactMatch) {
    const method = pickWebhookMethod(exactMatch[1]);
    if (method) return { name: exactMatch[0], method };
  }

  for (const [name, pathItem] of webhookEntries) {
    const method = pickWebhookMethod(pathItem);
    if (method) return { name, method };
  }

  return null;
}

function resolveTarget(schema: any, endpoint: string, method: SelectorMethod): ResolvedTarget | null {
  if (method === 'webhook') {
    const webhook = resolveWebhook(schema, endpoint);
    return webhook ? { type: 'webhook', item: webhook } : null;
  }

  const operation = resolveOperation(schema, endpoint, method);
  return operation ? { type: 'operation', item: operation } : null;
}

export async function VeluOpenAPI({
  schemaSource = DEFAULT_SCHEMA_SOURCE,
  inlineDocument,
  inlineDocumentId = 'velu-inline-openapi',
  layout = 'full',
  endpoint,
  method,
  proxyUrl = DEFAULT_PROXY_URL,
  exampleLanguages,
  exampleAutogenerate = true,
  className,
  showTitle = false,
  showDescription = false,
}: VeluOpenAPIProps) {
  const resolvedSource = resolveSchemaSource(schemaSource);
  const resolvedProxyUrl = typeof proxyUrl === 'string' && proxyUrl.trim().length > 0
    ? proxyUrl.trim()
    : undefined;
  const { renderer: APIPage, document, server } = inlineDocument
    ? getInlineRenderer(inlineDocumentId, inlineDocument, resolvedProxyUrl, layout, {
        exampleLanguages,
        exampleAutogenerate,
      })
    : getRenderer(resolvedSource, resolvedProxyUrl, layout, {
        exampleLanguages,
        exampleAutogenerate,
      });

  const endpointPath = endpoint ? String(endpoint) : undefined;
  const endpointMethod = normalizeMethod(method);
  const resolvedSchema = endpointPath ? await server.getSchema(document) : undefined;
  const resolvedTarget = endpointPath && resolvedSchema
    ? resolveTarget(resolvedSchema, endpointPath, endpointMethod)
    : null;
  const operations = endpointPath && resolvedTarget?.type === 'operation'
    ? [{ path: resolvedTarget.item.path, method: resolvedTarget.item.method }]
    : undefined;
  const webhooks = endpointPath && resolvedTarget?.type === 'webhook'
    ? [{ name: resolvedTarget.item.name, method: resolvedTarget.item.method }]
    : undefined;

  if (endpointPath && !resolvedTarget) {
    return (
      <section className={className}>
        <div className="velu-openapi-warning">
          <p>
            Could not find a usable operation in <code>{inlineDocument ? inlineDocumentId : schemaSource}</code>.
          </p>
        </div>
      </section>
    );
  }

  const isFallbackOperation = Boolean(
    endpointPath
      && resolvedTarget
      && (
        (resolvedTarget.type === 'operation'
          && (resolvedTarget.item.path !== endpointPath || resolvedTarget.item.method !== endpointMethod))
        || (resolvedTarget.type === 'webhook'
          && normalizeWebhookName(resolvedTarget.item.name) !== normalizeWebhookName(endpointPath))
      ),
  );
  const fallbackTargetLabel = resolvedTarget
    ? (resolvedTarget.type === 'operation'
      ? `${resolvedTarget.item.method.toUpperCase()} ${resolvedTarget.item.path}`
      : `WEBHOOK ${resolvedTarget.item.name}`)
    : '';

  return (
    <section className={className}>
      {isFallbackOperation ? (
        <div className="velu-openapi-warning">
          <p>
            Could not find <code>{endpointMethod.toUpperCase()} {endpointPath}</code> in <code>{inlineDocument ? inlineDocumentId : schemaSource}</code>.
            Showing <code>{fallbackTargetLabel}</code> instead.
          </p>
        </div>
      ) : null}
      <APIPage
        document={document}
        operations={operations}
        webhooks={webhooks}
        showTitle={showTitle}
        showDescription={showDescription}
      />
    </section>
  );
}

interface VeluOpenAPISchemaProps {
  schemaSource?: string;
  schema: string;
  className?: string;
}

export async function VeluOpenAPISchema({
  schemaSource = DEFAULT_SCHEMA_SOURCE,
  schema,
  className,
}: VeluOpenAPISchemaProps) {
  const schemaName = String(schema ?? '').trim();
  if (!schemaName) return null;

  const resolvedSource = resolveSchemaSource(schemaSource);
  const { document, server } = getRenderer(resolvedSource, undefined, 'full', {});
  const resolvedSchema = await server.getSchema(document);
  const schemas = resolvedSchema?.dereferenced?.components?.schemas;
  if (!schemas || typeof schemas !== 'object') {
    return (
      <section className={className}>
        <div className="velu-openapi-warning">
          <p>
            Could not find <code>components.schemas</code> in <code>{schemaSource}</code>.
          </p>
        </div>
      </section>
    );
  }

  const entries = Object.entries(schemas) as Array<[string, unknown]>;
  const exact = entries.find(([name]) => name === schemaName);
  const fallback = entries.find(([name]) => name.toLowerCase() === schemaName.toLowerCase());
  const selected = exact ?? fallback;
  if (!selected) {
    return (
      <section className={className}>
        <div className="velu-openapi-warning">
          <p>
            Could not find <code>components.schemas.{schemaName}</code> in <code>{schemaSource}</code>.
          </p>
        </div>
      </section>
    );
  }

  const selectedName = selected[0];
  const selectedSchema = selected[1] as Record<string, unknown>;
  const description = typeof selectedSchema?.description === 'string' ? selectedSchema.description : undefined;

  return (
    <section className={className}>
      <div className="velu-openapi-schema">
        <h2>{selectedName}</h2>
        {description ? <p>{description}</p> : null}
        <pre className="velu-openapi-schema-json">
          <code>{JSON.stringify(selectedSchema, null, 2)}</code>
        </pre>
      </div>
    </section>
  );
}
