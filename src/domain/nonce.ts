const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** A CSP script/style nonce, unique per webview HTML load. */
export function getNonce(length = 32): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return result;
}
