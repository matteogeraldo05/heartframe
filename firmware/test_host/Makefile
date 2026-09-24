# Host tests for lib/hfcore (no ESP32 needed).
# Needs mbedTLS 3.6 (same major version as ESP-IDF 5.5):
#   git clone --depth 1 -b v3.6.6 https://github.com/Mbed-TLS/mbedtls.git ~/src/mbedtls
#   cmake -S ~/src/mbedtls -B ~/src/mbedtls/build -DENABLE_TESTING=OFF -DENABLE_PROGRAMS=OFF && make -C ~/src/mbedtls/build -j
#   make -C test_host MBEDTLS=~/src/mbedtls
# ArduinoJson comes from PlatformIO's libdeps (run `pio run` once first).
MBEDTLS ?= $(HOME)/src/mbedtls
AJSON ?= ../.pio/libdeps/feather_s3/ArduinoJson/src
SRC = ../lib/hfcore/src

CXXFLAGS = -std=c++17 -O1 -g -Wall -Wextra -fsanitize=address,undefined -I$(SRC) -I$(AJSON) -I$(MBEDTLS)/include
LDFLAGS = -fsanitize=address,undefined -L$(MBEDTLS)/build/library -lmbedtls -lmbedx509 -lmbedcrypto

run: hfcore_tests
	./hfcore_tests

hfcore_tests: test_main.cpp $(wildcard $(SRC)/*.cpp) $(wildcard $(SRC)/*.h)
	$(CXX) $(CXXFLAGS) test_main.cpp $(SRC)/*.cpp -o $@ $(LDFLAGS)

clean:
	rm -f hfcore_tests

.PHONY: run clean
