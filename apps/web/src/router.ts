import { useEffect, useState } from 'react';

/** Minimal hash router: "#/exercises/abc" -> ["exercises", "abc"]. */
export function useRoute(): string[] {
  const parse = () => decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const navigate = (path: string) => {
  location.hash = `#/${path.replace(/^\//, '')}`;
};
