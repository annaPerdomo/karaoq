import { describe, expect, it } from 'vitest';
import { isAllowedFullModeHost } from './hostGuard.mjs';

describe('isAllowedFullModeHost', () => {
  it('allows the local hosts and staging', () => {
    expect(isAllowedFullModeHost('http://localhost:3100')).toBe(true);
    expect(isAllowedFullModeHost('http://127.0.0.1:3100')).toBe(true);
    expect(isAllowedFullModeHost('http://[::1]:3100')).toBe(true);
    expect(isAllowedFullModeHost('https://next.karaoq.live')).toBe(true);
  });

  it('allows a host with a port', () => {
    expect(isAllowedFullModeHost('http://localhost:65535/path')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAllowedFullModeHost('https://NEXT.KARAOQ.LIVE')).toBe(true);
    expect(isAllowedFullModeHost('http://LOCALHOST:3100')).toBe(true);
  });

  it('strips a trailing dot before matching', () => {
    expect(isAllowedFullModeHost('https://next.karaoq.live.')).toBe(true);
    expect(isAllowedFullModeHost('http://localhost.:3100')).toBe(true);
  });

  it('ignores userinfo in the URL', () => {
    expect(isAllowedFullModeHost('http://user:pass@localhost:3100')).toBe(true);
  });

  it('refuses the production hosts', () => {
    expect(isAllowedFullModeHost('https://karaoq.live')).toBe(false);
    expect(isAllowedFullModeHost('https://www.karaoq.live')).toBe(false);
  });

  it('refuses a lookalike host', () => {
    expect(isAllowedFullModeHost('https://next.karaoq.live.vercel.app')).toBe(false);
    expect(isAllowedFullModeHost('https://next-karaoq-live.vercel.app')).toBe(false);
  });

  it('returns false for an unparseable URL instead of throwing', () => {
    expect(isAllowedFullModeHost('not-a-url')).toBe(false);
  });
});
