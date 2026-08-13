import { describe, expect, it } from 'vitest';
import { getNonce } from '../../src/domain/nonce';

describe('getNonce', () => {
  it('generates a 32-character alphanumeric string', () => {
    const nonce = getNonce();

    expect(nonce).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  it('generates a different value on each call', () => {
    expect(getNonce()).not.toBe(getNonce());
  });
});
