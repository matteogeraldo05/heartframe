// log.h - printf-style logging to USB serial (only when a computer is listening).
// Never log secrets: tokens, keys and Wi-Fi passwords are redacted before printing.
#pragma once
#include <Arduino.h>

#define LOGF(fmt, ...)                                                   \
  do {                                                                   \
    if (Serial) Serial.printf("[%6lu] " fmt "\n", millis(), ##__VA_ARGS__); \
  } while (0)
