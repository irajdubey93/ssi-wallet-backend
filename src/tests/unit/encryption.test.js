const {
  generateSalt,
  deriveKey,
  encrypt,
  decrypt,
  generateNonce,
  verifySignature,
  generateKeyPair,
  sign
} = require('../../utils/encryption');

describe('Encryption Module', () => {
  describe('generateSalt', () => {
    it('should generate a base64-encoded salt', () => {
      const salt = generateSalt();
      expect(typeof salt).toBe('string');
      expect(salt.length).toBeGreaterThan(0);
      // Verify it's valid base64
      expect(() => Buffer.from(salt, 'base64')).not.toThrow();
    });

    it('should generate unique salts', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(salt1).not.toBe(salt2);
    });
  });

  describe('deriveKey', () => {
    it('should derive a 32-byte key from passphrase', async () => {
      const passphrase = 'test-passphrase-123';
      const salt = generateSalt();
      
      const key = await deriveKey(passphrase, salt);
      
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should derive same key for same passphrase and salt', async () => {
      const passphrase = 'test-passphrase-123';
      const salt = generateSalt();
      
      const key1 = await deriveKey(passphrase, salt);
      const key2 = await deriveKey(passphrase, salt);
      
      expect(key1.toString('hex')).toBe(key2.toString('hex'));
    });

    it('should derive different keys for different passphrases', async () => {
      const salt = generateSalt();
      
      const key1 = await deriveKey('passphrase-1', salt);
      const key2 = await deriveKey('passphrase-2', salt);
      
      expect(key1.toString('hex')).not.toBe(key2.toString('hex'));
    });

    it('should derive different keys for different salts', async () => {
      const passphrase = 'same-passphrase';
      
      const key1 = await deriveKey(passphrase, generateSalt());
      const key2 = await deriveKey(passphrase, generateSalt());
      
      expect(key1.toString('hex')).not.toBe(key2.toString('hex'));
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const plaintext = JSON.stringify({ test: 'data', number: 123 });
      const salt = generateSalt();
      const key = await deriveKey('test-passphrase', salt);
      
      const { ciphertext, iv, authTag } = encrypt(plaintext, key);
      const decrypted = decrypt(ciphertext, iv, authTag, key);
      
      expect(decrypted).toBe(plaintext);
      expect(JSON.parse(decrypted)).toEqual({ test: 'data', number: 123 });
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', async () => {
      const plaintext = 'same data';
      const salt = generateSalt();
      const key = await deriveKey('test-passphrase', salt);
      
      const result1 = encrypt(plaintext, key);
      const result2 = encrypt(plaintext, key);
      
      expect(result1.ciphertext).not.toBe(result2.ciphertext);
      expect(result1.iv).not.toBe(result2.iv);
    });

    it('should fail decryption with wrong key', async () => {
      const plaintext = 'secret data';
      const salt = generateSalt();
      const correctKey = await deriveKey('correct-passphrase', salt);
      const wrongKey = await deriveKey('wrong-passphrase', salt);
      
      const { ciphertext, iv, authTag } = encrypt(plaintext, correctKey);
      
      expect(() => decrypt(ciphertext, iv, authTag, wrongKey)).toThrow();
    });

    it('should fail decryption with tampered authTag', async () => {
      const plaintext = 'secret data';
      const salt = generateSalt();
      const key = await deriveKey('test-passphrase', salt);
      
      const { ciphertext, iv } = encrypt(plaintext, key);
      const tamperedAuthTag = Buffer.from('tampered-tag-here!!!').toString('base64');
      
      expect(() => decrypt(ciphertext, iv, tamperedAuthTag, key)).toThrow();
    });

    it('should handle large payloads', async () => {
      const largeData = JSON.stringify({ data: 'x'.repeat(100000) });
      const salt = generateSalt();
      const key = await deriveKey('test-passphrase', salt);
      
      const { ciphertext, iv, authTag } = encrypt(largeData, key);
      const decrypted = decrypt(ciphertext, iv, authTag, key);
      
      expect(decrypted).toBe(largeData);
    });

    it('should handle unicode characters', async () => {
      const unicodeData = JSON.stringify({ emoji: '🔐🔑', chinese: '加密', arabic: 'تشفير' });
      const salt = generateSalt();
      const key = await deriveKey('test-passphrase', salt);
      
      const { ciphertext, iv, authTag } = encrypt(unicodeData, key);
      const decrypted = decrypt(ciphertext, iv, authTag, key);
      
      expect(decrypted).toBe(unicodeData);
    });
  });

  describe('generateNonce', () => {
    it('should generate a base64-encoded nonce', () => {
      const nonce = generateNonce();
      expect(typeof nonce).toBe('string');
      expect(() => Buffer.from(nonce, 'base64')).not.toThrow();
    });

    it('should generate unique nonces', () => {
      const nonces = new Set();
      for (let i = 0; i < 100; i++) {
        nonces.add(generateNonce());
      }
      expect(nonces.size).toBe(100);
    });

    it('should generate nonce of specified length', () => {
      const nonce = generateNonce(64);
      const decoded = Buffer.from(nonce, 'base64');
      expect(decoded.length).toBe(64);
    });
  });

  describe('Ed25519 signatures', () => {
    it('should generate valid key pair', () => {
      const { publicKey, privateKey } = generateKeyPair();
      
      expect(typeof publicKey).toBe('string');
      expect(typeof privateKey).toBe('string');
      expect(() => Buffer.from(publicKey, 'base64')).not.toThrow();
      expect(() => Buffer.from(privateKey, 'base64')).not.toThrow();
    });

    it('should sign and verify correctly', () => {
      const { publicKey, privateKey } = generateKeyPair();
      const message = 'test message to sign';
      
      const signature = sign(message, privateKey);
      const isValid = verifySignature(message, signature, publicKey);
      
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong public key', () => {
      const keyPair1 = generateKeyPair();
      const keyPair2 = generateKeyPair();
      const message = 'test message';
      
      const signature = sign(message, keyPair1.privateKey);
      const isValid = verifySignature(message, signature, keyPair2.publicKey);
      
      expect(isValid).toBe(false);
    });

    it('should fail verification with altered message', () => {
      const { publicKey, privateKey } = generateKeyPair();
      const message = 'original message';
      
      const signature = sign(message, privateKey);
      const isValid = verifySignature('altered message', signature, publicKey);
      
      expect(isValid).toBe(false);
    });

    it('should fail verification with tampered signature', () => {
      const { publicKey, privateKey } = generateKeyPair();
      const message = 'test message';
      
      sign(message, privateKey);
      const tamperedSignature = Buffer.from('tampered-signature-data').toString('base64');
      const isValid = verifySignature(message, tamperedSignature, publicKey);
      
      expect(isValid).toBe(false);
    });
  });
});
