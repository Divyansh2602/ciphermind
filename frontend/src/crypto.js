/**
 * CipherMind — Cryptography Engine
 * Uses the Web Crypto API (built into every modern browser, zero dependencies)
 *
 * Algorithms:
 *   - PBKDF2 + SHA-512  → Key derivation from session passphrase
 *   - AES-256-GCM       → Authenticated encryption (provides confidentiality + authenticity)
 *   - HMAC-SHA-512      → Message integrity verification (separate from AES-GCM tag)
 *   - crypto.getRandomValues → Cryptographically secure random IV/salt
 */

const CryptoEngine = (() => {
  const ITERATIONS = 100000;      // PBKDF2 iterations
  const KEY_LENGTH = 256;         // AES key length in bits
  const IV_LENGTH = 12;           // GCM recommended IV size (bytes)
  const SALT_LENGTH = 32;         // PBKDF2 salt size (bytes)
  const TAG_LENGTH = 128;         // GCM authentication tag length (bits)

  let encKey = null;              // CryptoKey for AES-256-GCM
  let hmacKey = null;             // CryptoKey for HMAC-SHA-512
  let sessionPassphrase = '';     // The raw session passphrase
  let sessionKeyHex = '';         // Display-friendly key fingerprint

  /** Generate a fresh session passphrase (256 random bits → hex) */
  function generatePassphrase() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /** Convert ArrayBuffer → hex string */
  function bufToHex(buf) {
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /** Convert hex string → Uint8Array */
  function hexToBuf(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2)
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    return bytes;
  }

  /** Convert string → ArrayBuffer */
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  /**
   * Initialize the crypto engine with a fresh session key.
   * Derives AES + HMAC keys using PBKDF2.
   */
  async function init() {
    sessionPassphrase = generatePassphrase();

    // Import the passphrase as a raw key material for PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(sessionPassphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey', 'deriveBits']
    );

    // Salt for AES key
    const aesSalt = new Uint8Array(SALT_LENGTH);
    crypto.getRandomValues(aesSalt);

    // Derive AES-256-GCM key
    encKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: aesSalt,
        iterations: ITERATIONS,
        hash: 'SHA-512'
      },
      keyMaterial,
      { name: 'AES-GCM', length: KEY_LENGTH },
      true,   // extractable (for display only)
      ['encrypt', 'decrypt']
    );

    // Salt for HMAC key (separate from AES salt)
    const hmacSalt = new Uint8Array(SALT_LENGTH);
    crypto.getRandomValues(hmacSalt);

    // Derive HMAC-SHA-512 key from same passphrase, different salt
    const hmacBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: hmacSalt,
        iterations: ITERATIONS,
        hash: 'SHA-512'
      },
      keyMaterial,
      512
    );
    hmacKey = await crypto.subtle.importKey(
      'raw',
      hmacBits,
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign', 'verify']
    );

    // Export a truncated fingerprint for display
    const rawAes = await crypto.subtle.exportKey('raw', encKey);
    sessionKeyHex = bufToHex(rawAes).substring(0, 48) + '...';

    return {
      passphrase: sessionPassphrase.substring(0, 16) + '...',
      keyFingerprint: sessionKeyHex,
      algorithm: 'AES-256-GCM + PBKDF2/SHA-512 + HMAC-SHA-512'
    };
  }

  /**
   * Encrypt a plaintext string.
   * Returns an object with ciphertext, iv, hmac (for display/inspection).
   */
  async function encrypt(plaintext) {
    if (!encKey) throw new Error('Crypto engine not initialized');

    // Generate a fresh random IV for every message
    const iv = new Uint8Array(IV_LENGTH);
    crypto.getRandomValues(iv);

    // Encrypt
    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: TAG_LENGTH },
      encKey,
      enc.encode(plaintext)
    );

    const cipherHex = bufToHex(cipherBuf);
    const ivHex = bufToHex(iv);

    // HMAC over iv + ciphertext for an explicit integrity check
    const dataToSign = enc.encode(ivHex + cipherHex);
    const hmacBuf = await crypto.subtle.sign('HMAC', hmacKey, dataToSign);
    const hmacHex = bufToHex(hmacBuf);

    // Package as a JSON envelope
    const envelope = JSON.stringify({
      v: 1,
      alg: 'AES-256-GCM',
      mac: 'HMAC-SHA512',
      iv: ivHex,
      ct: cipherHex,
      hmac: hmacHex
    });

    return {
      envelope,
      ivHex,
      cipherHex: cipherHex.substring(0, 64) + '...',
      hmacHex: hmacHex.substring(0, 32) + '...',
      fullHmac: hmacHex,
      fullIv: ivHex,
      fullCipher: cipherHex
    };
  }

  /**
   * Decrypt an envelope string, verify HMAC first.
   * Returns plaintext or throws on tamper detection.
   */
  async function decrypt(envelopeStr) {
    if (!encKey) throw new Error('Crypto engine not initialized');

    const envelope = JSON.parse(envelopeStr);
    const { iv: ivHex, ct: cipherHex, hmac: storedHmac } = envelope;

    // Verify HMAC before decrypting (fail-fast on tamper)
    const dataToVerify = enc.encode(ivHex + cipherHex);
    const recomputedHmac = bufToHex(
      await crypto.subtle.sign('HMAC', hmacKey, dataToVerify)
    );

    if (recomputedHmac !== storedHmac) {
      throw new Error('HMAC VERIFICATION FAILED — message may have been tampered with!');
    }

    // Decrypt
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hexToBuf(ivHex), tagLength: TAG_LENGTH },
      encKey,
      hexToBuf(cipherHex)
    );

    return dec.decode(plainBuf);
  }

  /**
   * Compute SHA-256 hash of a string (for display/integrity checks).
   */
  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
    return bufToHex(buf);
  }

  return { init, encrypt, decrypt, sha256, getSessionKeyHex: () => sessionKeyHex };
})();

window.CryptoEngine = CryptoEngine;
