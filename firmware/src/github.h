// github.h - read files from the private messages repo through the GitHub REST
// "contents" API (api.github.com), NOT raw.githubusercontent.com, whose CDN can
// serve stale files for minutes. TLS is verified against the Mozilla root
// bundle that ships inside the ESP32 Arduino core (no single pinned root that
// can expire or be distrusted - Sectigo's old roots are being retired right now).
#pragma once
#include <Arduino.h>
#include <HTTPClient.h>
#include <NetworkClientSecure.h>

#include "secrets.h"

class RepoClient {
 public:
  explicit RepoClient(const Secrets& s);
  ~RepoClient();

  // GET `path` into buf. Returns the HTTP status (200, 304, 401, 404, ...) or a
  // negative number for network/TLS errors. On 200, outLen = bytes received.
  int fetch(const char* path, uint8_t* buf, size_t cap, size_t& outLen,
            const char* ifNoneMatch = nullptr, String* etagOut = nullptr);

  // GET `path` and pass the body to `sink` chunk by chunk (firmware updates).
  int stream(const char* path, Stream& sink);

  void setToken(const char* token) { token_ = token; }
  time_t serverTime() const { return serverTime_; }   // from the last "Date" header
  const String& tokenExpiry() const { return tokenExpiry_; }

 private:
  int begin(const char* path, const char* ifNoneMatch);
  void readHeaders();

  NetworkClientSecure tls_;
  HTTPClient http_;
  String base_;
  String branch_;
  String token_;
  time_t serverTime_ = 0;
  String tokenExpiry_;
};

// Global CA bundle hook, also used for the heartbeat request.
void useSystemRootCAs(NetworkClientSecure& client);
