import { Link as RouterLink } from 'react-router-dom';
import type { AnchorHTMLAttributes } from 'react';

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; replace?: boolean; prefetch?: boolean; scroll?: boolean };
export default function Link({ href, replace, prefetch, scroll, ...props }: Props) {
  void prefetch; void scroll; // Next-only options must not reach the DOM.
  if (href.startsWith('/') && !href.startsWith('//')) return <RouterLink to={href} replace={replace} {...props} />;
  // Legal contact links are the only external links used by the Toss screens.
  if (href.startsWith('mailto:')) return <a href={href} {...props} />;
  return <span className={props.className}>{props.children}</span>;
}
