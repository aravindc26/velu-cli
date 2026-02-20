import type { LucideIcon } from 'lucide-react';
import {
  Apple,
  ArrowRight,
  BookOpen,
  CircleHelp,
  Code2,
  Download,
  ExternalLink,
  Flag,
  Lightbulb,
  Hand,
  Layers3,
  Lock,
  Newspaper,
  Play,
  Rocket,
  Send,
  Smartphone,
  SquareTerminal,
  Sparkles,
  TriangleAlert,
  Webhook,
} from 'lucide-react';
import type { VeluIconLibrary } from '@/lib/velu';

const ICONS: Record<string, LucideIcon> = {
  apple: Apple,
  'arrow-right': ArrowRight,
  'book-open': BookOpen,
  'code-2': Code2,
  download: Download,
  'external-link': ExternalLink,
  flag: Flag,
  lightbulb: Lightbulb,
  hand: Hand,
  'layers-3': Layers3,
  lock: Lock,
  newspaper: Newspaper,
  play: Play,
  rocket: Rocket,
  send: Send,
  smartphone: Smartphone,
  'square-terminal': SquareTerminal,
  sparkles: Sparkles,
  'triangle-alert': TriangleAlert,
  webhook: Webhook,
};

const ALIASES: Record<string, string> = {
  api: 'code-2',
  bulb: 'lightbulb',
  'book-open-cover': 'book-open',
  'light-bulb': 'lightbulb',
  'hand-index-finger': 'hand',
  'hand-finger-right': 'hand',
  'hand-point-right': 'hand',
  'layer-group': 'layers-3',
};

function normalizeIconName(name: string): string {
  return name.toLowerCase().trim().replace(/[_\s]+/g, '-');
}

export function VeluIcon({
  name,
  library = 'fontawesome',
  iconType,
  color,
  className,
  fallback = true,
}: {
  name?: string;
  library?: VeluIconLibrary;
  iconType?: string;
  color?: string;
  className?: string;
  fallback?: boolean;
}) {
  if (!name) {
    return fallback ? <CircleHelp className={className} style={color ? { color } : undefined} aria-hidden="true" /> : null;
  }

  const normalized = normalizeIconName(name);
  if (/^(https?:\/\/|\/|\.{1,2}\/)/.test(name) || /\.(svg|png|jpg|jpeg|webp|gif)$/i.test(name)) {
    return <img src={name} alt="" className={className} aria-hidden="true" />;
  }

  const canonical = ALIASES[normalized] ?? normalized;
  const Icon = ICONS[canonical];

  if (Icon) return <Icon className={className} style={color ? { color } : undefined} aria-hidden="true" />;

  const faPrefixByType: Record<string, string> = {
    brands: 'fa6-brands',
    regular: 'fa6-regular',
    solid: 'fa6-solid',
    light: 'fa6-light',
    thin: 'fa6-thin',
    'sharp-solid': 'fa6-sharp-solid',
    duotone: 'fa6-duotone',
  };

  const prefix =
    library === 'lucide'
      ? 'lucide'
      : library === 'tabler'
        ? 'tabler'
        : faPrefixByType[(iconType ?? '').toLowerCase()] ?? 'fa6-solid';

  const iconifyName = canonical.replace(/^fa-/, '');
  const iconifyUrl = `https://api.iconify.design/${prefix}:${iconifyName}.svg`;

  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: '1em',
        height: '1em',
        backgroundColor: color ?? 'currentColor',
        WebkitMaskImage: `url("${iconifyUrl}")`,
        maskImage: `url("${iconifyUrl}")`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
}
