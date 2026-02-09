const crypto = require('crypto');
const { logger } = require('./logger');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

function generateSalt() {
  return crypto.randomBytes(SALT_LENGTH).toString('base64');
}

function deriveKey(passphrase, saltBase64) {
  return new Promise((resolve, reject) => {
    const salt = Buffer.from(saltBase64, 'base64');
    crypto.scrypt(passphrase, salt, KEY_LENGTH, SCRYPT_PARAMS, (err, derivedKey) => {
      if (err) {
        logger.error({ error: err.message }, 'Key derivation failed');
        reject(new Error('Key derivation failed'));
      } else {
        resolve(derivedKey);
      }
    });
  });
}

function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');
  
  return { ciphertext, iv: iv.toString('base64'), authTag };
}

function decrypt(ciphertextBase64, ivBase64, authTagBase64, key) {
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  
  let plaintext = decipher.update(ciphertextBase64, 'base64', 'utf8');
  plaintext += decipher.final('utf8');
  
  return plaintext;
}

function generateNonce(length = 32) {
  return crypto.randomBytes(length).toString('base64');
}

function verifySignature(message, signatureBase64, publicKeyBase64) {
  try {
    const publicKeyDer = Buffer.from(publicKeyBase64, 'base64');
    const signature = Buffer.from(signatureBase64, 'base64');
    
    const publicKey = crypto.createPublicKey({
      key: publicKeyDer,
      format: 'der',
      type: 'spki'
    });
    
    return crypto.verify(null, Buffer.from(message), publicKey, signature);
  } catch (error) {
    logger.warn({ error: error.message }, 'Signature verification failed');
    return false;
  }
}

function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')
  };
}

function sign(message, privateKeyBase64) {
  const privateKeyDer = Buffer.from(privateKeyBase64, 'base64');
  
  const privateKey = crypto.createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8'
  });
  
  const signature = crypto.sign(null, Buffer.from(message), privateKey);
  return signature.toString('base64');
}

module.exports = {
  generateSalt,
  deriveKey,
  encrypt,
  decrypt,
  generateNonce,
  verifySignature,
  generateKeyPair,
  sign,
  ALGORITHM,
  KEY_LENGTH,
  IV_LENGTH
};
