## 15. Sources

All checked on September 23, 2026. Prices, stock and service rules change: re-check anything before you pay for it.

**Boards, battery, LEDs, power**

- Adafruit ESP32-S3 Feather guide: [overview](https://learn.adafruit.com/adafruit-esp32-s3-feather/overview), [pinouts](https://learn.adafruit.com/adafruit-esp32-s3-feather/pinouts), [power management](https://learn.adafruit.com/adafruit-esp32-s3-feather/power-management), [full guide](https://learn.adafruit.com/adafruit-esp32-s3-feather?view=all)
- [PiShop.ca: ESP32-S3 Feather 8 MB no PSRAM](https://www.pishop.ca/product/adafruit-esp32-s3-feather-with-stemma-qt-qwiic-8mb-flash-no-psram/) · [Adafruit #5477](https://www.adafruit.com/product/5477) · [Adafruit #1781 (18650)](https://www.adafruit.com/product/1781) · [Adafruit #1131 (JST-PH extension)](https://www.adafruit.com/product/1131)
- [Feather specification](https://learn.adafruit.com/adafruit-feather/feather-specification)
- ESP32-C6 Feather comparison: [low power use](https://learn.adafruit.com/adafruit-esp32-c6-feather/low-power-use), [power management](https://learn.adafruit.com/adafruit-esp32-c6-feather/power-management)
- [WUSTL NeurotechHub: low deep-sleep current on the Feather ESP32-S3](https://neurotechhub.wustl.edu/achieving-super-low-deep-sleep-current-with-adafruit-feather-esp32-s3-with-i2c-enabled/)
- [grillbaer/esp32-power-consumption-test](https://github.com/grillbaer/esp32-power-consumption-test) (dev-board sleep currents)
- Unexpected Maker FeatherS3: [datasheet](https://www.mouser.com/datasheet/2/1362/Unexpected_Maker_Datasheet_FeatherS3-3395032.pdf), [product page](https://esp32s3.com/feathers3.html)
- [WS2812B datasheet](https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf)

**E-paper**

- [Waveshare 4.2" e-Paper Module manual](https://www.waveshare.com/wiki/4.2inch_e-Paper_Module_Manual) (dimensions, refresh rules, sunlight/storage precautions)
- GxEPD2: [README](https://github.com/ZinggJM/GxEPD2/blob/master/README.md), [ConnectingHardware](https://github.com/ZinggJM/GxEPD2/blob/master/ConnectingHardware.md)
- Arduino forum: [Waveshare "5V-compatible" modules and deep-sleep current](https://forum.arduino.cc/t/howto-fix-5v-compatible-waveshare-e-papers-to-allow-minimum-current-in-deep-sleep-mode-with-partial-update-afterwards-though/1025243), [GDEY042T81 partial update after deep sleep](https://forum.arduino.cc/t/gxepd2-gdey042t81-waveshare-4-2-bw-v2-2-partial-update-and-esp32-deep-sleep-how-to/1231233)

**Firmware toolchain and libraries**

- [pioarduino platform-espressif32 releases](https://github.com/pioarduino/platform-espressif32/releases)
- arduino-esp32 issues [#10949](https://github.com/espressif/arduino-esp32/issues/10949), [#12368](https://github.com/espressif/arduino-esp32/issues/12368)
- Pinned libraries: [GxEPD2](https://github.com/ZinggJM/GxEPD2), [Adafruit GFX](https://github.com/adafruit/Adafruit-GFX-Library), [Adafruit BusIO](https://github.com/adafruit/Adafruit_BusIO), [Adafruit NeoPixel](https://github.com/adafruit/Adafruit_NeoPixel), [ArduinoJson](https://github.com/bblanchon/ArduinoJson), [WiFiManager](https://github.com/tzapu/WiFiManager), [Mbed TLS](https://github.com/Mbed-TLS/mbedtls) (host tests); [Adafruit_MAX1704X](https://github.com/adafruit/Adafruit_MAX1704X) (reviewed, not used: `begin()` resets the gauge)

**GitHub, TLS, tokens**

- [REST API: repository contents](https://docs.github.com/en/rest/repos/contents)
- [Token expiration and revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation)
- [GitHub changelog: optional expiration for fine-grained PATs (Oct 2024)](https://github.blog/changelog/2024-10-18-new-pat-rotation-policies-preview-and-optional-expiration-for-fine-grained-pats/)
- [Sectigo: changes to root CA hierarchies and trust status](https://www.sectigo.com/resource-library/changes-to-root-ca-hierarchies-and-trust-status)
- [github.com certificate chain](https://guardssl.info/ssl/github.com)

**Server side**

- [Tailscale Serve](https://tailscale.com/kb/1312/serve)
- [healthchecks.io HTTP API](https://healthchecks.io/docs/http_api/)
- [better-sqlite3](https://www.npmjs.com/package/better-sqlite3)

**Enclosure: printing services and materials**

- JLC3DP: [3D printing design guideline](https://jlc3dp.com/help/article/3d-printing-design-guideline), [SLA service](https://jlc3dp.com/3d-printing/stereolithography), [9600 resin](https://jlc3dp.com/help/article/photosensitive-9600-resin), [9600 vs 8111X](https://jlc3dp.com/blog/resin-9600-vs-8111x), [LEDO 6060](https://jlc3dp.com/help/article/ledo-6060---photosensitive-resin), [8001 resin](https://jlc3dp.com/help/article/photosensitive-8001-resin), [8228 resin](https://jlc3dp.com/help/article/photosensitive-8228-resin), [comparing SLA resins](https://jlc3dp.com/help/article/comparing-sla-resin-materials), [MJF PA12 vs SLS nylon](https://jlc3dp.com/help/article/What-are-the-differences-between-MJF-PA12-Nylon-and-SLS-3201PA-F-Nylon), [resin yellowing](https://jlc3dp.com/blog/resin-yellowing)
- JLC3DP inserts: [threaded insert service (types, 3 mm wall, 14 × 14 mm flat area, drawing)](https://jlc3dp.com/help/article/threaded-insert-service), [inserts design guide](https://jlc3dp.com/blog/threaded-inserts-3d-printing), [inserts in electronics housings](https://jlc3dp.com/blog/threaded-inserts-3d-prints), [JLCHUB announcement (supported materials)](https://jlchub.com/posts/18915-%F0%9F%94%A9Threaded%20Inserts%20Service%20Now%20Available%20on%20JLC3DP)
- [Somos LEDO 6060 datasheet](https://oversea.assets.unionfab.com/wp-content/uploads/2023/02/Somos_LEDO_6060.pdf) ("a little yellow")
- [Forge Labs Toronto](https://forgelabs.com/3d-printing/toronto)
- [KiCad forum: Canadian hobbyists on JLC shipping and brokerage](https://forum.kicad.info/t/alternatives-to-jlcpcb-or-pcbway-for-canadian-hobbyist/61624)
- Library 3D printing: [King Township PL Make-It Lab](https://www.kinglibrary.ca/Make-It-Lab/maker-equipment), [Ontario Tech library guidelines](https://guides.library.ontariotechu.ca/3dprinting/guidelines), [Ontario Tech printers](https://guides.library.ontariotechu.ca/3dprinting/printer-specs), [Toronto Public Library 3D printers](https://tpl.ca/using-the-library/computer-services/digital-innovation-services/3d-printers/)
- Plan B frames: [IKEA SANNAHED](https://www.ikea.com/ca/en/p/sannahed-frame-white-00459116/), [Michaels shadow boxes](https://canada.michaels.com/shop/frames/shadow-boxes)

**CAD tools**

- [OpenSCAD downloads](https://openscad.org/downloads.html) · [Fedora openscad package versions](https://packages.fedoraproject.org/pkgs/openscad/openscad/) · [Manifold backend flag (`--backend=manifold`)](https://gist.github.com/ochafik/95587ff653ecb708cbf9a735723b1478)
- [Onshape plans](https://www.onshape.com/en/pricing) · [Onshape student subscription](https://cad.onshape.com/help/Content/manage_student_account.htm)
- [Autodesk Fusion system requirements](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/System-requirements-for-Autodesk-Fusion-360.html) (Windows/macOS/browser; no Linux)

**Logistics**

- [2024–2025 Canada Post labour dispute](https://en.wikipedia.org/wiki/2024%E2%80%932025_Canada_Post_labour_dispute)
