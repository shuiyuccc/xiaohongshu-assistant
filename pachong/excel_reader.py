"""Read Xiaohongshu crawler Excel files for the web app."""

import argparse
import json
import sys
from pathlib import Path

from openpyxl import load_workbook


TITLE_HEADERS = {"标题", "title", "Title"}
CONTENT_HEADERS = {"正文", "内容", "文案", "content", "Content"}


def _safe_text(value):
    if value is None:
        return ""
    return str(value).strip()


def _iter_excel_files(root):
    root = Path(root).resolve()
    if not root.exists():
        return []

    return [
        path
        for path in root.rglob("*.xlsx")
        if path.is_file() and not path.name.startswith("~$")
    ]


def _find_columns(headers):
    title_col = None
    content_col = None

    for index, header in enumerate(headers):
        text = _safe_text(header)
        if text in TITLE_HEADERS:
            title_col = index
        elif text in CONTENT_HEADERS:
            content_col = index

    return title_col, content_col


def _read_posts(path, limit=None):
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        sheet = workbook.active
        rows = sheet.iter_rows(values_only=True)
        headers = next(rows, [])
        title_col, content_col = _find_columns(headers)

        if title_col is None or content_col is None:
            return []

        posts = []
        for row in rows:
            title = _safe_text(row[title_col] if title_col < len(row) else "")
            content = _safe_text(row[content_col] if content_col < len(row) else "")
            if not title or not content:
                continue

            posts.append({
                "title": title,
                "content": content,
            })

        return posts[:limit] if limit else posts
    finally:
        workbook.close()


def _latest_files_by_blogger(root):
    latest = {}
    for path in _iter_excel_files(root):
        name = path.stem
        current = latest.get(name)
        if current is None or path.stat().st_mtime > current.stat().st_mtime:
            latest[name] = path
    return latest


def list_bloggers(root):
    bloggers = []
    for name, path in sorted(_latest_files_by_blogger(root).items()):
        posts = _read_posts(path, limit=None)
        bloggers.append({
            "name": name,
            "postCount": len(posts),
            "modifiedAt": path.stat().st_mtime,
            "fileName": path.name,
            "runDir": path.parent.name,
            "sampleTitles": [post["title"] for post in posts[:3] if post.get("title")],
        })
    return {"bloggers": bloggers}


def read_blogger(root, name, limit):
    latest = _latest_files_by_blogger(root)
    path = latest.get(name)
    if not path:
        raise FileNotFoundError(f"未找到博主 Excel: {name}")

    posts = _read_posts(path, limit=limit)
    return {
        "blogger": {
            "name": name,
            "postCount": len(_read_posts(path, limit=None)),
            "modifiedAt": path.stat().st_mtime,
            "fileName": path.name,
            "runDir": path.parent.name,
        },
        "posts": posts,
    }


def main():
    parser = argparse.ArgumentParser(description="Read crawler Excel files")
    parser.add_argument("--mode", choices=["list", "read"], required=True)
    parser.add_argument("--output-dir", default="./xiaohongshu_notes")
    parser.add_argument("--name", default="")
    parser.add_argument("--limit", type=int, default=30)
    args = parser.parse_args()

    try:
        if args.mode == "list":
            result = list_bloggers(args.output_dir)
        else:
            result = read_blogger(args.output_dir, args.name, max(args.limit, 1))
        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
