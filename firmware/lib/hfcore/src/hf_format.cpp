#include "hf_format.h"

#include <string.h>

namespace hf {

bool envelopeHeaderOk(const uint8_t* env, size_t len, uint8_t expectKind) {
  if (env == nullptr || len < kEnvOverhead + 1) return false;
  if (memcmp(env, "HFE1", 4) != 0) return false;
  if (env[4] != 1) return false;              // version
  if (env[5] != expectKind) return false;     // kind
  if (env[6] != 0 || env[7] != 0) return false;
  return true;
}

bool bitmapHeaderOk(const uint8_t* bmp, size_t len) {
  if (bmp == nullptr || len != kBitmapFileLen) return false;
  if (memcmp(bmp, "HFB1", 4) != 0) return false;
  const uint16_t w = (uint16_t)(bmp[4] | (bmp[5] << 8));
  const uint16_t h = (uint16_t)(bmp[6] | (bmp[7] << 8));
  if (w != kWidth || h != kHeight) return false;
  if (bmp[8] != 1) return false;  // 1 bpp
  return true;
}

}  // namespace hf
