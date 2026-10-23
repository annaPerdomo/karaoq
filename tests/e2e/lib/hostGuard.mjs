const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'next.karaoq.live']);

export function isAllowedFullModeHost(baseUrl) {
  let hostname;
  try {
    hostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  hostname = hostname.replace(/\.$/, '');
  return ALLOWED_HOSTS.has(hostname);
}
