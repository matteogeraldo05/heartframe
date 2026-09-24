# Heart Frame: Build Guide

*A battery-powered e-paper message frame with a glowing pink heart. The project runs from September 23, 2026, when this guide was written. Everything should be finished and tested by early December, ready to give on December 25.*

This guide starts from your draft plan and corrects it. It has three kinds of content:

1. A **review of your plan** listing every problem I found and what I changed.
2. The **corrected design**: parts, wiring, power budget, the full firmware, the full web app, the GitHub setup, security and safety, and the enclosure.
3. The **process**: a build order with test milestones, a dated timeline, and a hand-off section for after she has it.

All the code is in this document. The same files are also in the `heartframe/` bundle next to it, laid out as the monorepo, so you don't have to copy and paste. Before writing this guide I verified the code as follows:

- **Firmware:** compiles cleanly (no warnings in our code) for both Feather variants with PlatformIO + pioarduino (Arduino-ESP32 3.3.11, ESP-IDF 5.5.5).
- **Firmware core logic** (file formats, AES-GCM, ECDSA, manifest parsing, DST-safe scheduling): about 50 checks pass on a PC under AddressSanitizer and UBSan. The C++ decryptor reads files produced by the web app's TypeScript encryptor, so the two sides are known to agree.
- **Web app:** type-checks, builds, and passes 27 tests. These include an end-to-end test that publishes to a fake GitHub and decrypts the result the way the frame would. I also drove the UI in a real Chromium browser and checked the rendering.
- **Provisioning script:** tested against a simulated serial device.
- **OTA signing tool:** tested on a real `firmware.bin`.
- **Enclosure:** every part and variant (inserts / nuts / self-tapping, 18650 / pouch, SLA / FDM clearances) renders to a watertight STL in OpenSCAD 2021.01, the version Fedora ships.

**Not tested:** real hardware. Everything that depends on the physical parts is gated by a test milestone in the build order.

## Assumptions (tell me if any are wrong)

| Assumption | If it's wrong |
|---|---|
| The frame lives at her family's home, on ordinary 2.4 GHz WPA2/WPA3-Personal Wi-Fi with no sign-in page. | Campus/eduroam (WPA2-Enterprise) or hotel-style sign-in pages don't work with ESP32 captive-portal setup. Fix: a small travel router (e.g. GL.iNet) in repeater mode that presents a normal WPA2 network. |
| Your always-on Debian/CasaOS box runs Docker, and you'll use Tailscale. | Any Docker host works. Without Tailscale, use LAN only with `COOKIE_SECURE=false`, which is weaker; see §9.6. |
| Your leftover LEDs are **5 V WS2812B** (3 pins: 5V, DIN, GND). | 12 V strips (WS2811/WS2815) won't run from a single Li-ion cell, so buy 4 WS2812B pixels. RGBW (SK6812) needs `LED_ORDER` changed plus small code changes, so avoid it. A 2-minute check is in §6. |
| Parts budget is about CAD $150–250 plus tools. | Cheaper alternatives are listed in the BOM. |

## Contents

1. [Review of your plan](#1-review-of-your-plan)
2. [Overview, architecture and final design decisions](#2-overview-architecture-and-final-design-decisions)
3. [Bill of materials](#3-bill-of-materials)
4. [Tools and a soldering primer](#4-tools-and-a-soldering-primer)
5. [Power budget and battery life](#5-power-budget-and-battery-life)
6. [Wiring, pinout and the LED power switch](#6-wiring-pinout-and-the-led-power-switch)
7. [Build order with test milestones](#7-build-order-with-test-milestones)
8. [Firmware (full source)](#8-firmware-full-source)
9. [Web app (full source, Docker)](#9-web-app-full-source-docker)
10. [GitHub: repos, formats, tokens](#10-github-repos-formats-tokens)
11. [Security and safety](#11-security-and-safety)
12. [Enclosure](#12-enclosure)
13. [Testing, failure modes and timeline](#13-testing-failure-modes-and-timeline)
14. [Hand-off: her Wi-Fi, daily use, adding messages](#14-hand-off-her-wi-fi-daily-use-adding-messages)
15. [Sources](#15-sources)
