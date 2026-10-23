import { describe, expect, it } from 'vitest';
import { isAllowedHost } from '../../load/lib/guard.js';

describe('isAllowedHost', () => {
  it('allows the local hosts and staging', () => {
    expect(isAllowedHost('http://localhost:3100')).toBe(true);
    expect(isAllowedHost('http://127.0.0.1:3100')).toBe(true);
    expect(isAllowedHost('http://[::1]:3100')).toBe(true);
    expect(isAllowedHost('https://next.karaoq.live')).toBe(true);
  });

  it('allows a host with a port', () => {
    expect(isAllowedHost('http://localhost:65535/path')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAllowedHost('https://NEXT.KARAOQ.LIVE')).toBe(true);
    expect(isAllowedHost('http://LOCALHOST:3100')).toBe(true);
  });

  it('strips a trailing dot before matching', () => {
    expect(isAllowedHost('https://next.karaoq.live.')).toBe(true);
    expect(isAllowedHost('http://localhost.:3100')).toBe(true);
  });

  it('ignores userinfo in the URL', () => {
    expect(isAllowedHost('http://user:pass@localhost:3100')).toBe(true);
  });

  it('refuses the production hosts', () => {
    expect(isAllowedHost('https://karaoq.live')).toBe(false);
    expect(isAllowedHost('https://www.karaoq.live')).toBe(false);
  });

  it('refuses a lookalike host', () => {
    expect(isAllowedHost('https://next.karaoq.live.vercel.app')).toBe(false);
    expect(isAllowedHost('https://next-karaoq-live.vercel.app')).toBe(false);
  });

  it('returns false instead of throwing on a bad URL', () => {
    expect(isAllowedHost('not-a-url')).toBe(false);
  });
});
