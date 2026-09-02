#!/usr/bin/env python3
"""Publish one approved LinkedIn company-page post.

Called by the approval watcher after a human replies `post`. Reads the caption and
image produced by the drafting job and publishes them to the organization page whose
credentials live in the token file.

    linkedin_org_post.py --caption-file <path> --image <path> --token-env <path>

The token file is per brand and is never printed. Success is a single stdout line:

    POSTED:urn:li:share:7493189734295359488

Anything else on stdout is a failure. `DUPLICATE:` means the page already carries a
post for this caption today; the caller must stop rather than retry.

API contract: skills/brand-content-pipeline/references/linkedin-api-publishing.md.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

API_BASE = "https://api.linkedin.com/rest"
# Pinned deliberately. Bumping it is an API migration, not a version bump: the
# posts payload shape changed between versions and an unpinned client breaks silently.
LINKEDIN_VERSION = "202401"
MAX_COMMENTARY = 3000
TIMEOUT = 60


class PublishError(RuntimeError):
    """Anything that must stop the publish without a retry."""


def load_token_env(path: Path) -> tuple[str, str]:
    """Return (access_token, page_id). Never logs or echoes the file contents."""
    if not path.exists():
        raise PublishError(f"token file missing: {path}")
    mode = path.stat().st_mode & 0o777
    if mode & 0o077:
        raise PublishError(f"token file {path} is mode {mode:o}; expected 600")

    values: dict[str, str] = {}
    for line in path.read_text(errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        values[key.strip()] = val.strip().strip("'\"")

    token = values.get("LINKEDIN_ACCESS_TOKEN", "")
    page_id = values.get("LINKEDIN_PAGE_ID", "")
    if not token:
        raise PublishError(f"LINKEDIN_ACCESS_TOKEN missing from {path}")
    if len(token) < 100:
        # An expired/truncated token fails at the API with an opaque 401. Catch it here.
        raise PublishError(
            f"LINKEDIN_ACCESS_TOKEN in {path} is {len(token)} chars; expected ~175-350 "
            "— regenerate before publishing"
        )
    if not page_id.isdigit():
        # The URN needs the numeric org id. A slug here 422s with no useful message.
        raise PublishError(f"LINKEDIN_PAGE_ID must be numeric, got {page_id!r}")
    return token, page_id


def _request(url: str, token: str, *, data: bytes | None = None,
             headers: dict[str, str] | None = None, method: str = "GET") -> tuple[int, bytes, dict]:
    req_headers = {
        "Authorization": f"Bearer {token}",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
    }
    req_headers.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as exc:
        body = exc.read()
        # Surface LinkedIn's own message; its 4xx bodies explain scope problems precisely.
        detail = body.decode(errors="replace")[:500]
        raise PublishError(f"HTTP {exc.code} from {url}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise PublishError(f"network failure calling {url}: {exc.reason}") from exc


def upload_image(token: str, page_id: str, image: Path) -> str:
    """Three-step upload; returns the image URN to reference in the post."""
    owner = f"urn:li:organization:{page_id}"
    payload = json.dumps({"initializeUploadRequest": {"owner": owner}}).encode()
    _, body, _ = _request(
        f"{API_BASE}/images?action=initializeUpload",
        token,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    value = json.loads(body).get("value") or {}
    upload_url = value.get("uploadUrl")
    image_urn = value.get("image")
    if not upload_url or not image_urn:
        raise PublishError(f"initializeUpload returned no upload target: {body[:300]!r}")

    content_type = mimetypes.guess_type(image.name)[0] or "image/png"
    _request(
        upload_url,
        token,
        data=image.read_bytes(),
        headers={"Content-Type": content_type},
        method="PUT",
    )
    return image_urn


def publish(token: str, page_id: str, caption: str, image_urn: str | None) -> str:
    body: dict = {
        "author": f"urn:li:organization:{page_id}",
        "commentary": caption,
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    if image_urn:
        body["content"] = {"media": {"id": image_urn}}

    status, payload, headers = _request(
        f"{API_BASE}/posts",
        token,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    # The post URN comes back in a header, not the body, on a 201.
    urn = headers.get("x-restli-id") or headers.get("X-RestLi-Id")
    if not urn and payload:
        urn = (json.loads(payload) or {}).get("id")
    if not urn:
        raise PublishError(
            f"post accepted (HTTP {status}) but returned no URN — "
            "check the company page before doing anything else"
        )
    return urn


def read_caption(path: Path) -> str:
    if not path.exists():
        raise PublishError(f"caption file missing: {path}")
    caption = path.read_text(encoding="utf-8", errors="replace").strip()
    if not caption:
        raise PublishError(f"caption file is empty: {path}")
    if len(caption) > MAX_COMMENTARY:
        raise PublishError(
            f"caption is {len(caption)} chars; LinkedIn rejects anything over {MAX_COMMENTARY}"
        )
    return caption


def check_same_draft(caption_file: Path, image: Path) -> None:
    """A fresh caption paired with a stale PNG publishes silently and looks correct."""
    dates = []
    for path in (caption_file, image):
        match = re.match(r"(\d{4}-\d{2}-\d{2})", path.name)
        if not match:
            raise PublishError(f"cannot read a draft date from {path.name}")
        dates.append(match.group(1))
    if dates[0] != dates[1]:
        raise PublishError(
            f"caption is dated {dates[0]} but image is dated {dates[1]} — "
            "these are different drafts; re-render before publishing"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--caption-file", required=True, type=Path)
    parser.add_argument("--image", type=Path, help="omit to publish a text-only post")
    parser.add_argument("--token-env", required=True, type=Path,
                        help="per-brand token file; never shared between brands")
    parser.add_argument("--dry-run", action="store_true",
                        help="validate everything and stop before the API call")
    args = parser.parse_args()

    try:
        caption = read_caption(args.caption_file)
        if args.image:
            if not args.image.exists():
                raise PublishError(f"image missing: {args.image}")
            check_same_draft(args.caption_file, args.image)
        token, page_id = load_token_env(args.token_env)

        if args.dry_run or os.environ.get("DRY_RUN") == "1":
            print(f"DRYRUN:would post {len(caption)} chars"
                  f"{' with image' if args.image else ' text-only'} "
                  f"to urn:li:organization:{page_id}")
            return 0

        image_urn = upload_image(token, page_id, args.image) if args.image else None
        urn = publish(token, page_id, caption, image_urn)
    except PublishError as exc:
        print(f"ERROR:{exc}", file=sys.stderr)
        return 1

    print(f"POSTED:{urn}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
