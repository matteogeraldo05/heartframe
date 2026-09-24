#!/usr/bin/env python3
"""Store the Heart Frame's secrets in its NVS over USB serial.

Run it with PlatformIO's Python (it already has pyserial):
    ~/.platformio/penv/bin/python tools/provision.py --port /dev/ttyACM0 \
        --owner YOUR_GITHUB_USER --repo heartframe-messages \
        --key-file ../webapp/secrets/message_key --portal-pass 'pick-8+-chars'

The device token is asked for interactively (never put it in shell history).
When the script says "waiting for the frame", press the RESET button on the Feather.
Nothing secret is printed back; the frame only confirms "PROV OK".
"""
import argparse
import base64
import getpass
import json
import re
import sys
import time

try:
    import serial  # pyserial
except ImportError:
    sys.exit("pyserial missing - run this with ~/.platformio/penv/bin/python")


def open_port(port: str, timeout_s: float = 60.0) -> "serial.Serial":
    """The ESP32-S3's native USB disappears during reset, so keep retrying."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            s = serial.Serial(port, 115200, timeout=0.2)
        except (serial.SerialException, OSError):
            time.sleep(0.3)
            continue
        try:
            s.dtr = True  # the firmware only opens its console when a terminal is attached
        except (serial.SerialException, OSError):
            pass
        return s
    sys.exit(f"could not open {port} - is the frame plugged in? (Fedora: add yourself to 'dialout')")


def read_until(s, pattern: str, timeout_s: float) -> str:
    buf = ""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        chunk = s.read(256).decode(errors="replace")
        if chunk:
            buf += chunk
            if re.search(pattern, buf):
                return buf
    return buf


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", required=True, help="e.g. /dev/ttyACM0")
    ap.add_argument("--owner", required=True, help="GitHub user that owns the messages repo")
    ap.add_argument("--repo", required=True, help="private messages repo name")
    ap.add_argument("--branch", default="main")
    ap.add_argument("--key-file", required=True, help="base64 32-byte message key (same file the web app uses)")
    ap.add_argument("--portal-pass", required=True, help="password for the Wi-Fi setup hotspot (8-63 chars)")
    ap.add_argument("--token-gen", type=int, default=1, help="token generation number (bump when re-provisioning)")
    args = ap.parse_args()

    key_b64 = open(args.key_file).read().strip()
    if len(base64.b64decode(key_b64)) != 32:
        sys.exit("key file must contain 32 bytes, base64 encoded")
    if not 8 <= len(args.portal_pass) <= 63:
        sys.exit("portal password must be 8-63 characters")
    token = getpass.getpass("Device token (fine-grained, read-only, messages repo only): ").strip()
    if not token.startswith("github_pat_"):
        sys.exit("that doesn't look like a fine-grained token (github_pat_...)")

    payload = json.dumps({
        "owner": args.owner, "repo": args.repo, "branch": args.branch,
        "token": token, "key": key_b64, "ppass": args.portal_pass, "tokgen": args.token_gen,
    }, separators=(",", ":"))

    print(f"Waiting for the frame on {args.port} - press RESET on the Feather now...")
    s = open_port(args.port)
    out = read_until(s, r"Press Enter", 20)
    if "Press Enter" not in out:
        # Port may have been opened before the reset; reopen once and try again.
        s.close()
        s = open_port(args.port)
        out = read_until(s, r"Press Enter", 20)
        if "Press Enter" not in out:
            sys.exit("no console banner seen. Press RESET while this script is waiting, with USB connected.")
    s.write(b"\n")
    read_until(s, r"> ", 5)
    s.write(("prov " + payload + "\n").encode())
    payload = token = ""  # drop secrets from memory as soon as possible
    reply = read_until(s, r"PROV (OK|ERROR[^\r\n]*)", 10)
    m = re.search(r"PROV (OK|ERROR[^\r\n]*)", reply)
    if not m:
        sys.exit("no reply from the frame")
    print("frame says:", m.group(0))
    s.write(b"status\n")
    print(read_until(s, r"fs: ", 5).split("status", 1)[-1])
    s.write(b"exit\n")
    s.close()
    sys.exit(0 if m.group(1) == "OK" else 1)


if __name__ == "__main__":
    main()
