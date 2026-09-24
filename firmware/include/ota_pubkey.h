// ota_pubkey.h - ECDSA P-256 public key that firmware updates must be signed with.
// Regenerate with:  python tools/ota_keys.py keygen   (writes this file + a private key
// that stays on your laptop). An empty key disables over-the-air updates entirely.
#pragma once
#include <stddef.h>
#include <stdint.h>

static const uint8_t OTA_PUBKEY_DER[] = {0x00};
static const size_t OTA_PUBKEY_DER_LEN = 0;  // 0 = OTA disabled
