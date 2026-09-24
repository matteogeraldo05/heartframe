// hf_crypto.h - thin wrappers over mbedTLS (built into ESP-IDF; on a PC use mbedTLS 3.6).
#pragma once
#include <stddef.h>
#include <stdint.h>

#include "mbedtls/sha256.h"

namespace hf {

constexpr size_t kKeyLen = 32;  // AES-256

// Decrypt + authenticate an HFE1 envelope (see hf_format.h).
// Writes the plaintext to `out` (needs envLen - 36 bytes) and returns its length,
// or -1 if the header is wrong, the buffer is too small, or authentication fails
// (wrong key, corrupted download, or tampering).
int envelopeOpen(const uint8_t key[kKeyLen], const uint8_t* env, size_t envLen,
                 uint8_t expectKind, uint8_t* out, size_t outCap);

// One-shot SHA-256.
void sha256(const uint8_t* data, size_t len, uint8_t out[32]);

// Streaming SHA-256 (used while downloading firmware).
class Sha256 {
 public:
  Sha256();
  ~Sha256();
  void update(const uint8_t* data, size_t len);
  void finish(uint8_t out[32]);
 private:
  mbedtls_sha256_context ctx_;
};

// Verify an ECDSA P-256 signature (DER encoded) over a SHA-256 hash, using a
// DER SubjectPublicKeyInfo public key. Returns true only if valid.
bool ecdsaP256Verify(const uint8_t* pubKeyDer, size_t pubKeyLen, const uint8_t hash[32],
                     const uint8_t* sigDer, size_t sigLen);

// Base64 decode. Returns decoded length, or 0 on error / overflow.
size_t base64Decode(const char* in, uint8_t* out, size_t outCap);

// Lower-case hex encoding; `out` must hold 2*n+1 chars.
void toHex(const uint8_t* in, size_t n, char* out);

// Constant-time comparison.
bool constTimeEq(const uint8_t* a, const uint8_t* b, size_t n);

}  // namespace hf
