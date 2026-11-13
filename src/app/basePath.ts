/** Public URL prefix set by Vite. Root locally; /Republic/ on the VPS. */
export const basePath = import.meta.env.BASE_URL;

export function appPath(path = ''): string {
  return `${basePath}${path.replace(/^\/+/, '')}`;
}

export function isAppPath(path: string): boolean {
  return location.pathname.replace(/\/+$/, '') === appPath(path).replace(/\/+$/, '');
}
