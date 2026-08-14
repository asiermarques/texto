import { describe, expect, it } from 'vitest';
import english from '../../package.nls.json';
import spanish from '../../package.nls.es.json';

/**
 * US-004: `package.json`'s `%key%` placeholders resolve through these two
 * bundles — English is the fallback bundle VSCode loads for every display
 * language that is not Spanish, `package.nls.es.json` covers Spanish. VSCode
 * resolves each key independently, so a key present in one bundle but
 * missing from the other degrades silently to the raw `%key%` string (or the
 * wrong language) rather than failing loudly — this is the check that stands
 * in for the end-to-end Spanish verification RISK-002 says the integration
 * host cannot do (no Spanish language pack in the test host).
 */
describe('package.nls.json / package.nls.es.json — key parity', () => {
  it('declares the exact same set of keys in both bundles', () => {
    expect(Object.keys(spanish).sort()).toEqual(Object.keys(english).sort());
  });

  it('gives every key a non-empty string in both languages', () => {
    for (const [key, value] of Object.entries(english)) {
      expect(typeof value, `english["${key}"]`).toBe('string');
      expect((value as string).length, `english["${key}"] should not be empty`).toBeGreaterThan(0);
    }
    for (const [key, value] of Object.entries(spanish)) {
      expect(typeof value, `spanish["${key}"]`).toBe('string');
      expect((value as string).length, `spanish["${key}"] should not be empty`).toBeGreaterThan(0);
    }
  });
});
