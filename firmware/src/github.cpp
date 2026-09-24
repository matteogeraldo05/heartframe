#include "github.h"

#include "config.h"
#include "hf_time.h"
#include "log.h"

// The full Mozilla CA bundle compiled into the Arduino core's mbedTLS
// (CONFIG_MBEDTLS_CERTIFICATE_BUNDLE_DEFAULT_FULL). Updating the firmware with a
// newer core refreshes it.
extern const uint8_t x509_crt_bundle_start[] asm("_binary_x509_crt_bundle_start");
extern const uint8_t x509_crt_bundle_end[] asm("_binary_x509_crt_bundle_end");

void useSystemRootCAs(NetworkClientSecure& client) {
  client.setCACertBundle(x509_crt_bundle_start, x509_crt_bundle_end - x509_crt_bundle_start);
  client.setHandshakeTimeout(20);  // seconds
}

namespace {
// Stream adapter: collects a response body into a fixed buffer.
class BufferSink : public Stream {
 public:
  BufferSink(uint8_t* buf, size_t cap) : buf_(buf), cap_(cap) {}
  size_t write(uint8_t c) override { return write(&c, 1); }
  size_t write(const uint8_t* data, size_t n) override {
    if (len_ + n > cap_) { overflow_ = true; return 0; }
    memcpy(buf_ + len_, data, n);
    len_ += n;
    return n;
  }
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}
  size_t len() const { return len_; }
  bool overflow() const { return overflow_; }
 private:
  uint8_t* buf_;
  size_t cap_;
  size_t len_ = 0;
  bool overflow_ = false;
};

const char* kHeaderKeys[] = {"ETag", "Date", "github-authentication-token-expiration"};
}  // namespace

RepoClient::RepoClient(const Secrets& s) {
  useSystemRootCAs(tls_);
  tls_.setTimeout(HTTP_TIMEOUT_MS);
  base_ = String("https://api.github.com/repos/") + s.owner + "/" + s.repo + "/contents/";
  branch_ = s.branch;
  token_ = s.token;
  http_.setReuse(true);  // one TLS handshake for all files of this wake (saves ~1 s each)
  http_.setConnectTimeout(10000);
  http_.setTimeout(HTTP_TIMEOUT_MS);
  http_.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
}

RepoClient::~RepoClient() {
  http_.end();
  tls_.stop();
  token_ = "";
}

int RepoClient::begin(const char* path, const char* ifNoneMatch) {
  String url = base_ + path + "?ref=" + branch_;
  if (!http_.begin(tls_, url)) return -100;
  http_.collectHeaders(kHeaderKeys, 3);
  http_.addHeader("Authorization", String("Bearer ") + token_);
  http_.addHeader("Accept", "application/vnd.github.raw+json");  // raw bytes, not base64 JSON
  http_.addHeader("X-GitHub-Api-Version", "2022-11-28");
  http_.setUserAgent(HF_USER_AGENT);  // GitHub rejects requests without a User-Agent
  if (ifNoneMatch && ifNoneMatch[0]) http_.addHeader("If-None-Match", ifNoneMatch);
  return 0;
}

void RepoClient::readHeaders() {
  time_t t = hf::parseHttpDate(http_.header("Date").c_str());
  if (t) serverTime_ = t;
  String exp = http_.header("github-authentication-token-expiration");
  if (exp.length()) tokenExpiry_ = exp;
}

int RepoClient::fetch(const char* path, uint8_t* buf, size_t cap, size_t& outLen,
                      const char* ifNoneMatch, String* etagOut) {
  outLen = 0;
  int rc = begin(path, ifNoneMatch);
  if (rc < 0) return rc;
  int code = http_.GET();
  if (code > 0) readHeaders();
  if (code == 200) {
    BufferSink sink(buf, cap);
    int n = http_.writeToStream(&sink);
    if (n < 0 || sink.overflow()) {
      LOGF("github: body read failed for %s (%d%s)", path, n, sink.overflow() ? ", too big" : "");
      http_.end();
      tls_.stop();
      return -101;
    }
    outLen = sink.len();
    if (etagOut) *etagOut = http_.header("ETag");
  } else if (code > 0 && code != 304) {
    http_.getString();  // drain the small error body so the kept-alive connection stays usable
    LOGF("github: %s -> HTTP %d", path, code);
  } else if (code < 0) {
    LOGF("github: %s -> %s", path, HTTPClient::errorToString(code).c_str());
    tls_.stop();
  }
  http_.end();
  return code;
}

int RepoClient::stream(const char* path, Stream& sink) {
  int rc = begin(path, nullptr);
  if (rc < 0) return rc;
  int code = http_.GET();
  if (code > 0) readHeaders();
  if (code == 200) {
    int n = http_.writeToStream(&sink);
    if (n < 0) code = -102;
  } else if (code > 0) {
    http_.getString();
  }
  http_.end();
  return code;
}
