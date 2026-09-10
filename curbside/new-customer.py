#!/usr/bin/env python3
"""Create a new customer folder from the template.

    ./new-customer.py joes-lawn "Joe's Lawn Care" "(555) 201-4477" joe@joeslawn.com

Then open customers/joes-lawn/index.html?setup in a browser, tune the rates,
click "Copy config block", and paste it over the CONFIG block in that file.
Upload the folder and send them the link.
"""
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "template", "index.html")


def js_string(value):
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def set_field(html, key, value):
    """Replace one key's value inside the CONFIG block only."""
    pattern = re.compile(r'(\n  ' + re.escape(key) + r':\s*)("(?:[^"\\]|\\.)*"|[^,\n]+)(,?)')
    replacement = lambda m: m.group(1) + js_string(value) + m.group(3)
    html, count = pattern.subn(replacement, html, count=1)
    if count != 1:
        sys.exit("could not find CONFIG key %r in the template" % key)
    return html


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    slug, name, phone = sys.argv[1], sys.argv[2], sys.argv[3]
    email = sys.argv[4] if len(sys.argv) > 4 else "quotes@example.com"
    endpoint = sys.argv[5] if len(sys.argv) > 5 else ""

    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", slug):
        sys.exit("slug must be lowercase letters, digits and dashes: %r" % slug)

    dest_dir = os.path.join(HERE, "customers", slug)
    if os.path.exists(dest_dir):
        sys.exit("customers/%s already exists — delete it first if you meant to start over" % slug)

    html = open(TEMPLATE, encoding="utf-8").read()
    html = set_field(html, "bizName", name)
    html = set_field(html, "bizTel", phone)
    html = set_field(html, "notifyEmail", email)
    html = set_field(html, "leadEndpoint", endpoint)

    os.makedirs(dest_dir)
    dest = os.path.join(dest_dir, "index.html")
    open(dest, "w", encoding="utf-8").write(html)

    print("Created customers/%s/index.html" % slug)
    print()
    print("  1. open   customers/%s/index.html?setup   and set their rates" % slug)
    print("  2. click  Copy config block   and paste it over the CONFIG block in that file")
    if not endpoint:
        print("  3. set    leadEndpoint      so quote requests get emailed to %s" % email)
    print("  4. upload the customers/ folder, send them the link")


if __name__ == "__main__":
    main()
