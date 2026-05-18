"""API bridge for running the original Xiaohongshu scraper.

This file deliberately uses XiaoHongShuScraper.get_all_notes(), so the browser
flow stays close to running xiaohongshu_scraper.py directly. The web app only
overrides selected config values for the current run, then reads the generated
note folders back into JSON for the frontend.
"""

import argparse
import contextlib
import json
import re
import sys
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

import config
from xiaohongshu_scraper import XiaoHongShuScraper


def _normalize_note(note):
    data = asdict(note)
    images = data.get("images") or []
    videos = data.get("videos") or []

    return {
        "id": data.get("note_id", ""),
        "noteId": data.get("note_id", ""),
        "title": data.get("title", ""),
        "content": data.get("content", ""),
        "url": data.get("url", ""),
        "likes": data.get("likes", ""),
        "collects": data.get("collects", ""),
        "comments": data.get("comments", ""),
        "images": images,
        "videos": videos,
        "cover": images[0] if images else "",
        "isVideo": bool(data.get("is_video")),
    }


def _parse_article_md(article_path: Path):
    text = article_path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()
    title = ""
    content_lines = []
    url = ""
    likes = ""
    collects = ""
    comments = ""

    for line in lines:
        stripped = line.strip()
        if not title and stripped.startswith("# "):
            title = stripped[2:].strip()
            continue

        if stripped.startswith("[") and "](" in stripped:
            match = re.search(r"\((https?://[^)]+)\)", stripped)
            if match:
                url = match.group(1)
            continue

        if "点赞:" in stripped or "收藏:" in stripped or "评论:" in stripped:
            likes_match = re.search(r"点赞:\s*([^|]+)", stripped)
            collects_match = re.search(r"收藏:\s*([^|]+)", stripped)
            comments_match = re.search(r"评论:\s*([^|]+)", stripped)
            likes = likes_match.group(1).strip() if likes_match else likes
            collects = collects_match.group(1).strip() if collects_match else collects
            comments = comments_match.group(1).strip() if comments_match else comments
            continue

        if stripped and stripped != "---" and not stripped.startswith("http"):
            content_lines.append(line)

    return {
        "id": article_path.parent.name,
        "noteId": article_path.parent.name,
        "title": title,
        "content": "\n".join(content_lines).strip(),
        "url": url,
        "likes": likes,
        "collects": collects,
        "comments": comments,
        "images": [],
        "videos": [],
        "cover": "",
        "isVideo": False,
    }


def _read_generated_note_folders(run_dir: Path):
    posts = []
    for article_path in sorted(run_dir.glob("note_*/article.md")):
        post = _parse_article_md(article_path)
        if post["title"] or post["content"]:
            posts.append(post)
    return posts


def _apply_runtime_config(args, run_dir: Path):
    config.PROFILE_URL = args.url
    config.OUTPUT_DIR = str(run_dir)
    if args.download_media is not None:
        config.DOWNLOAD_IMAGES = args.download_media
    config.LOGIN_WAIT_TIME = args.login_wait

    if args.headless is not None:
        config.HEADLESS = args.headless


def run(args):
    output_root = Path(args.output_dir).resolve()
    run_dir = output_root / datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir.mkdir(parents=True, exist_ok=True)
    _apply_runtime_config(args, run_dir)

    # 从环境变量读取已存在的 note_id 列表
    existing_note_ids = set()
    if os.environ.get("EXISTING_NOTE_IDS"):
        existing_note_ids = set(os.environ["EXISTING_NOTE_IDS"].split(","))
        print(f"[增量爬取] 已存在 {len(existing_note_ids)} 条笔记，将自动跳过")

    scraper = XiaoHongShuScraper(
        headless=config.HEADLESS,
        output_dir=str(run_dir),
        download_images=config.DOWNLOAD_IMAGES,
        max_notes=args.count,
        existing_note_ids=existing_note_ids,
    )

    notes = scraper.get_all_notes(args.url) or []
    posts = [_normalize_note(note) for note in notes]

    folder_posts = _read_generated_note_folders(run_dir)
    if folder_posts:
        posts_by_title = {post.get("title"): post for post in posts if post.get("title")}
        for folder_post in folder_posts:
            if folder_post["title"] not in posts_by_title:
                posts.append(folder_post)

    return {
        "posts": posts,
        "outputDir": str(run_dir),
        "sourceName": args.source_name or args.url,
        "skippedCount": len(existing_note_ids),
    }


def main():
    parser = argparse.ArgumentParser(description="Run xiaohongshu_scraper.py through the web app")
    parser.add_argument("--url", required=True)
    parser.add_argument("--count", type=int, default=10)
    parser.add_argument("--source-name", default="")
    parser.add_argument("--output-dir", default="./xiaohongshu_notes")
    parser.add_argument("--login-wait", type=int, default=max(config.LOGIN_WAIT_TIME, 180))
    parser.add_argument("--headless", action=argparse.BooleanOptionalAction, default=None)
    parser.add_argument("--download-media", action=argparse.BooleanOptionalAction, default=None)
    args = parser.parse_args()

    try:
        with contextlib.redirect_stdout(sys.stderr):
            result = run(args)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
