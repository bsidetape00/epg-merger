"""
Merge multiple XMLTV EPG sources into one combined.xml.gz file.

Sources (edit the list below to add/remove):
  - xmltv.net Newcastle (AU FTA, Newcastle region)
  - EPGTalk US, UK, Combined (US/UK/Canada/Mexico)
  - i.mjh.nz Foxtel (Fox Sports Australia + Foxtel lineup)

Output: combined.xml.gz in the working directory.
"""

import gzip
import sys
import time
import urllib.request
from lxml import etree

SOURCES = [
    ("Newcastle AU",        "http://xmltv.net/xml_files/Newcastle.xml",                                       False),
    ("EPGTalk US",          "https://raw.githubusercontent.com/acidjesuz/EPGTalk/master/US_guide.xml.gz",     True),
    ("EPGTalk UK",          "https://raw.githubusercontent.com/acidjesuz/EPGTalk/master/UK_guide.xml.gz",     True),
    ("EPGTalk Combined",    "https://raw.githubusercontent.com/acidjesuz/EPGTalk/master/guide.xml.gz",        True),
    ("Foxtel AU",           "https://i.mjh.nz/Foxtel/epg.xml.gz",                                             True),
]

OUTPUT = "combined.xml.gz"
USER_AGENT = "Mozilla/5.0 (compatible; epg-merger/1.0)"
TIMEOUT = 180


def fetch(url, is_gz):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        data = r.read()
    if is_gz:
        data = gzip.decompress(data)
    return data


def main():
    merged = etree.Element("tv", attrib={"generator-info-name": "epg-merger"})

    seen_channels = set()
    seen_programmes = set()
    totals = {"channels": 0, "programmes": 0, "sources_ok": 0, "sources_failed": 0}

    for name, url, is_gz in SOURCES:
        print(f"[{name}] fetching {url}")
        start = time.time()
        try:
            data = fetch(url, is_gz)
        except Exception as e:
            print(f"[{name}] FAILED: {e}")
            totals["sources_failed"] += 1
            continue

        try:
            parser = etree.XMLParser(recover=True, huge_tree=True)
            root = etree.fromstring(data, parser)
        except Exception as e:
            print(f"[{name}] parse failed: {e}")
            totals["sources_failed"] += 1
            continue

        ch_added = 0
        for ch in root.findall("channel"):
            cid = ch.get("id")
            if cid and cid not in seen_channels:
                seen_channels.add(cid)
                merged.append(ch)
                ch_added += 1

        pr_added = 0
        for pr in root.findall("programme"):
            key = (pr.get("channel"), pr.get("start"))
            if key not in seen_programmes:
                seen_programmes.add(key)
                merged.append(pr)
                pr_added += 1

        totals["channels"] += ch_added
        totals["programmes"] += pr_added
        totals["sources_ok"] += 1
        print(f"[{name}] +{ch_added} channels, +{pr_added} programmes "
              f"({time.time() - start:.1f}s)")

    # Write straight to gzip, no uncompressed intermediate
    xml_bytes = etree.tostring(merged, encoding="UTF-8", xml_declaration=True)
    with gzip.open(OUTPUT, "wb", compresslevel=9) as f:
        f.write(xml_bytes)

    size_mb = len(xml_bytes) / (1024 * 1024)
    print(f"\nDone. {totals['channels']} channels, {totals['programmes']} programmes.")
    print(f"Sources ok: {totals['sources_ok']}, failed: {totals['sources_failed']}.")
    print(f"Uncompressed XML: {size_mb:.1f} MB. Wrote {OUTPUT}.")

    # Fail the build if every source died
    if totals["sources_ok"] == 0:
        print("All sources failed. Exiting non-zero so the workflow flags it.")
        sys.exit(1)


if __name__ == "__main__":
    main()
