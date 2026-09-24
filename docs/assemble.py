#!/usr/bin/env python3
"""Build docs/BUILD_GUIDE.md from docs/src/*.md.

Each `@@include <path> <lang>@@` line is replaced by the file at <path>
(relative to the repo root) in a fenced code block, so the guide always
contains the real, current source. Also checks every in-document link
(#anchor) against the headings, GitHub-style.

    python3 docs/assemble.py            # writes docs/BUILD_GUIDE.md
    python3 docs/assemble.py out.md     # or somewhere else
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "src"
INCLUDE = re.compile(r"^@@include (\S+) (\S+)@@\s*$")


def fence_for(text: str) -> str:
    longest = max((len(m) for m in re.findall(r"`{3,}", text)), default=0)
    return "`" * max(3, longest + 1)


def expand(line: str) -> str:
    m = INCLUDE.match(line)
    if not m:
        return line
    path, lang = m.groups()
    f = ROOT / path
    if not f.is_file():
        sys.exit(f"missing include: {path}")
    body = f.read_text(encoding="utf-8").rstrip("\n")
    fence = fence_for(body)
    return f"**`{path}`**\n\n{fence}{lang}\n{body}\n{fence}\n"


def slug(heading: str) -> str:
    s = heading.strip().lower()
    s = re.sub(r"[`*_]", "", s)
    s = re.sub(r"[^\w\- ]", "", s)
    return s.replace(" ", "-")


def check_links(text: str) -> list:
    # headings outside code fences
    anchors, in_code, fence = set(), False, ""
    for line in text.splitlines():
        m = re.match(r"^(`{3,})", line)
        if m:
            if not in_code:
                in_code, fence = True, m.group(1)
            elif line.strip() == fence:
                in_code = False
            continue
        if not in_code and line.startswith("#"):
            anchors.add(slug(line.lstrip("#")))
    return sorted({a for a in re.findall(r"\]\(#([^)]+)\)", text) if a not in anchors})


def main():
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs" / "BUILD_GUIDE.md"
    parts = []
    for f in sorted(SRC.glob("*.md")):
        parts.append("\n".join(expand(l) for l in f.read_text(encoding="utf-8").splitlines()).strip() + "\n")
    text = "\n".join(parts)
    bad = check_links(text)
    if bad:
        sys.exit(f"broken in-document links: {bad}")
    out.write_text(text, encoding="utf-8")
    print(f"wrote {out} ({len(text.splitlines())} lines, {len(text.encode()) // 1024} KB)")


if __name__ == "__main__":
    main()
