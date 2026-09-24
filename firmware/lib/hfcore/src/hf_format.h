// hf_format.h - on-the-wire formats shared with the web app (webapp/src/shared/format.ts).
//
// Two layers:
//   HFE1 "envelope": AES-256-GCM encrypted + authenticated container.
//        [0..3]  "HFE1"
//        [4]     version = 1
//        [5]     kind: 1 = manifest (UTF-8 JSON), 2 = bitmap (HFB1)
//        [6..7]  reserved = 0
//        [8..19] 12-byte random nonce
//        [20..n-17] ciphertext
//        [n-16..n-1] 16-byte GCM tag
//        AAD = bytes [0..19] (so "kind" cannot be swapped without detection)
//   HFB1 "bitmap": the plaintext inside a kind=2 envelope.
//        [0..3]  "HFB1"
//        [4..5]  width  (uint16 little-endian) = 400
//        [6..7]  height (uint16 little-endian) = 300
//        [8]     format = 1 (1 bit per pixel, row-major, MSB = leftmost pixel, 1 = BLACK)
//        [9]     flags = 0
//        [10..11] reserved = 0
//        [12..]  width*height/8 = 15000 bytes of pixel data
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace hf {

constexpr uint16_t kWidth = 400;
constexpr uint16_t kHeight = 300;
constexpr size_t kBitmapDataLen = (size_t)kWidth * kHeight / 8;       // 15000
constexpr size_t kBitmapHdrLen = 12;
constexpr size_t kBitmapFileLen = kBitmapHdrLen + kBitmapDataLen;      // 15012

constexpr size_t kEnvHdrLen = 20;
constexpr size_t kEnvTagLen = 16;
constexpr size_t kEnvOverhead = kEnvHdrLen + kEnvTagLen;              // 36
constexpr uint8_t kKindManifest = 1;
constexpr uint8_t kKindBitmap = 2;

constexpr size_t kMaxManifestJson = 12 * 1024;                          // plaintext cap
constexpr size_t kMaxManifestEnv = kMaxManifestJson + kEnvOverhead;
constexpr size_t kBitmapEnvLen = kBitmapFileLen + kEnvOverhead;        // 15048

// True if env looks like a well-formed envelope of the expected kind.
bool envelopeHeaderOk(const uint8_t* env, size_t len, uint8_t expectKind);

// True if bmp is a valid 400x300 1-bpp HFB1 bitmap of exactly kBitmapFileLen bytes.
bool bitmapHeaderOk(const uint8_t* bmp, size_t len);

// Pixel data pointer inside a valid HFB1 buffer.
inline const uint8_t* bitmapPixels(const uint8_t* bmp) { return bmp + kBitmapHdrLen; }

}  // namespace hf
