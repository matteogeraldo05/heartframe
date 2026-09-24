#include "hf_crypto.h"

#include <string.h>

#include "hf_format.h"
#include "mbedtls/base64.h"
#include "mbedtls/gcm.h"
#include "mbedtls/pk.h"

namespace hf {

int envelopeOpen(const uint8_t key[kKeyLen], const uint8_t* env, size_t envLen,
                 uint8_t expectKind, uint8_t* out, size_t outCap) {
  if (!envelopeHeaderOk(env, envLen, expectKind)) return -1;
  const size_t ctLen = envLen - kEnvOverhead;
  if (ctLen > outCap) return -1;

  const uint8_t* nonce = env + 8;                   // 12 bytes
  const uint8_t* ct = env + kEnvHdrLen;
  const uint8_t* tag = env + envLen - kEnvTagLen;

  mbedtls_gcm_context gcm;
  mbedtls_gcm_init(&gcm);
  int rc = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, key, kKeyLen * 8);
  if (rc == 0) {
    // AAD = the 20-byte header (magic, version, kind, reserved, nonce).
    rc = mbedtls_gcm_auth_decrypt(&gcm, ctLen, nonce, 12, env, kEnvHdrLen, tag, kEnvTagLen, ct, out);
  }
  mbedtls_gcm_free(&gcm);
  if (rc != 0) {
    memset(out, 0, ctLen);  // never leave unauthenticated plaintext around
    return -1;
  }
  return (int)ctLen;
}

void sha256(const uint8_t* data, size_t len, uint8_t out[32]) {
  mbedtls_sha256(data, len, out, 0 /* is224 = false */);
}

Sha256::Sha256() {
  mbedtls_sha256_init(&ctx_);
  mbedtls_sha256_starts(&ctx_, 0);
}
Sha256::~Sha256() { mbedtls_sha256_free(&ctx_); }
void Sha256::update(const uint8_t* data, size_t len) { mbedtls_sha256_update(&ctx_, data, len); }
void Sha256::finish(uint8_t out[32]) { mbedtls_sha256_finish(&ctx_, out); }

bool ecdsaP256Verify(const uint8_t* pubKeyDer, size_t pubKeyLen, const uint8_t hash[32],
                     const uint8_t* sigDer, size_t sigLen) {
  if (pubKeyDer == nullptr || pubKeyLen == 0 || sigDer == nullptr || sigLen == 0) return false;
  mbedtls_pk_context pk;
  mbedtls_pk_init(&pk);
  bool ok = false;
  if (mbedtls_pk_parse_public_key(&pk, pubKeyDer, pubKeyLen) == 0 &&
      mbedtls_pk_can_do(&pk, MBEDTLS_PK_ECDSA)) {
    ok = mbedtls_pk_verify(&pk, MBEDTLS_MD_SHA256, hash, 32, sigDer, sigLen) == 0;
  }
  mbedtls_pk_free(&pk);
  return ok;
}

size_t base64Decode(const char* in, uint8_t* out, size_t outCap) {
  size_t olen = 0;
  if (mbedtls_base64_decode(out, outCap, &olen, (const unsigned char*)in, strlen(in)) != 0) return 0;
  return olen;
}

void toHex(const uint8_t* in, size_t n, char* out) {
  static const char* digits = "0123456789abcdef";
  for (size_t i = 0; i < n; i++) {
    out[2 * i] = digits[in[i] >> 4];
    out[2 * i + 1] = digits[in[i] & 0x0f];
  }
  out[2 * n] = '\0';
}

bool constTimeEq(const uint8_t* a, const uint8_t* b, size_t n) {
  uint8_t diff = 0;
  for (size_t i = 0; i < n; i++) diff |= (uint8_t)(a[i] ^ b[i]);
  return diff == 0;
}

}  // namespace hf
