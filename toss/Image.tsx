import type { ImgHTMLAttributes } from 'react';
type Props = ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean; fill?: boolean; quality?: number };
export default function Image({ priority, fill, quality, alt = '', style, ...props }: Props) {
  void quality; // Vite serves static assets without Next's image optimizer.
  // eslint-disable-next-line @next/next/no-img-element -- This adapter runs in the static Toss client.
  return <img {...props} alt={alt} loading={priority ? 'eager' : 'lazy'} style={{ ...(fill ? { width: '100%', height: '100%', objectFit: 'cover' as const } : {}), ...style }} />;
}
