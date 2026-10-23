import { describe, expect, it } from 'vitest';
import { urlFor } from './url.mjs';

describe('urlFor', () => {
  it('joins a base URL and a path', () => {
    expect(urlFor('http://127.0.0.1:3100', '/api/health')).toBe('http://127.0.0.1:3100/api/health');
  });

  it('keeps a base URL with a trailing slash from doubling up', () => {
    expect(urlFor('https://next.karaoq.live/', '/songs')).toBe('https://next.karaoq.live/songs');
  });
});
