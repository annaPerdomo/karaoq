// No `new URL()` — k6's goja JS runtime doesn't implement it. Parsed by hand
// to match its hostname semantics: lowercased, userinfo/port dropped, a
// trailing dot stripped, IPv6 literals keeping their brackets.
const ALLOWED_HOSTS = ['localhost', '127.0.0.1', '[::1]', 'next.karaoq.live'];

export function isAllowedHost(baseUrl) {
  const afterScheme = String(baseUrl).replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const authority = afterScheme.split(/[/?#]/)[0];
  if (!authority) return false;

  const atIndex = authority.lastIndexOf('@');
  const hostAndPort = atIndex === -1 ? authority : authority.slice(atIndex + 1);

  let hostname;
  if (hostAndPort.startsWith('[')) {
    const close = hostAndPort.indexOf(']');
    if (close === -1) return false;
    hostname = hostAndPort.slice(0, close + 1);
  } else {
    hostname = hostAndPort.split(':')[0];
  }

  hostname = hostname.toLowerCase().replace(/\.$/, '');
  return ALLOWED_HOSTS.indexOf(hostname) !== -1;
}
