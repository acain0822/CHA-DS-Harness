import type { CSSProperties } from 'react';
import './Icon.css';

/*
 * Icons are the SVGs exported from Figma, stored in src/assets/icons by
 * `npm run fetch:figma-assets`. Each is drawn as a CSS mask so it takes the
 * text colour of its parent: Figma exports one copy of the arrow per colour,
 * this keeps a single file per shape.
 *
 * Until the assets are fetched, icons render as empty 16px boxes rather than
 * breaking the build.
 */
const files = import.meta.glob('../../assets/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byName: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace('.svg', ''), url]),
);

export type IconName = 'arrow-right' | 'arrow-left' | 'check';

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 16, className }: IconProps) {
  const url = byName[name];
  const style = {
    '--icon-size': `${size}px`,
    ...(url ? { '--icon-url': `url("${url}")` } : {}),
  } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      className={['cha-icon', url ? '' : 'cha-icon--missing', className].filter(Boolean).join(' ')}
      style={style}
      data-icon={name}
    />
  );
}
