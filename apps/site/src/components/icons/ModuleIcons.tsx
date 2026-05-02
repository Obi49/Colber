import * as React from 'react';

/**
 * Five hand-rolled SVG glyphs for the modules + identity pillar.
 *
 * Avoiding `lucide-react` here keeps the static export bundle tight (the
 * landing page should ship under 100 KB of JS gz). Each icon is a 24×24
 * stroke-based glyph, inheriting `currentColor`, sized via Tailwind.
 */

type IconKey = 'shield' | 'brain' | 'eye' | 'scale' | 'umbrella';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  readonly title?: string;
}

const Svg: React.FC<IconProps & { readonly children: React.ReactNode }> = ({
  title,
  children,
  ...props
}) => (
  <svg
    width={24}
    height={24}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    role={title === undefined ? 'presentation' : 'img'}
    aria-hidden={title === undefined ? true : undefined}
    {...props}
  >
    {title === undefined ? null : <title>{title}</title>}
    {children}
  </svg>
);

const ShieldIcon: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

const BrainIcon: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path d="M12 5a3 3 0 0 0-3 3 3 3 0 0 0-3 3 3 3 0 0 0 1.5 2.6A3 3 0 0 0 9 19a3 3 0 0 0 3-1" />
    <path d="M12 5a3 3 0 0 1 3 3 3 3 0 0 1 3 3 3 3 0 0 1-1.5 2.6A3 3 0 0 1 15 19a3 3 0 0 1-3-1" />
    <path d="M12 5v14" />
  </Svg>
);

const EyeIcon: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

const ScaleIcon: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path d="M12 3v18" />
    <path d="M5 21h14" />
    <path d="M5 6h14" />
    <path d="m5 6-3 6a4 4 0 0 0 6 0z" />
    <path d="m19 6-3 6a4 4 0 0 0 6 0z" />
  </Svg>
);

const UmbrellaIcon: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path d="M2 12a10 10 0 0 1 20 0z" />
    <path d="M12 12v6a3 3 0 0 1-6 0" />
  </Svg>
);

const iconMap: Record<IconKey, React.FC<IconProps>> = {
  shield: ShieldIcon,
  brain: BrainIcon,
  eye: EyeIcon,
  scale: ScaleIcon,
  umbrella: UmbrellaIcon,
};

interface ModuleIconProps extends IconProps {
  readonly iconKey: IconKey;
}

export const ModuleIcon: React.FC<ModuleIconProps> = ({ iconKey, ...rest }) => {
  const Component = iconMap[iconKey];
  return <Component {...rest} />;
};

export const ArrowRightIcon: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Svg>
);

export const ExternalLinkIcon: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path d="M15 3h6v6" />
    <path d="m10 14 11-11" />
    <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
  </Svg>
);

export const GitHubIcon: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </Svg>
);
