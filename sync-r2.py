#!/usr/bin/env python3
"""
sync-r2.py - 从 R2 同步新音乐文件，校验封面/歌词完整性

用法: python3 sync-r2.py [music_dir]

工作流:
1. 列出 R2 中全部 MP3 / 封面 / 歌词
2. 读取当前 music_list.js
3. 对比：下载 MP3 中在列表但不存在的封面/歌词的处理
  - music_list 中已存在 MP3 但 cover/lrc 引用文件在 R2 不存在 → 标记重下载
  - music_list 中不存在的 MP3 → 下载
4. 输出 synced 状态
"""

import os
import sys
import json
import urllib.request
import subprocess

TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', '')
ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '')
BUCKET = 'maxcloud'
PREFIX = 'public/music/'
MUSIC_DIR = sys.argv[1] if len(sys.argv) > 1 else 'public/music'


def list_r2_objects():
    """列出 R2 中所有对象"""
    items = []
    cursor = None
    while True:
        url = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/r2/buckets/{BUCKET}/objects?limit=100'
        if cursor:
            from urllib.parse import quote
            url += f'&cursor={quote(cursor)}'
        req = urllib.request.Request(url, headers={'Authorization': f'Bearer {TOKEN}'})
        try:
            resp = urllib.request.urlopen(req)
            data = json.load(resp)
        except Exception as e:
            print(f'❌ R2 API error: {e}', file=sys.stderr)
            return [], [], []

        for obj in data.get('result', []):
            items.append(obj['key'])
        info = data.get('result_info', {})
        cursor = info.get('cursor')
        if not info.get('is_truncated'):
            break

    mp3s = [k for k in items if k.endswith('.mp3') and k.startswith(PREFIX)]
    covers = set(k for k in items if any(k.endswith(e) for e in ['.jpg', '.jpeg', '.png', '.webp']))
    lrcs = set(k for k in items if k.endswith('.lrc'))
    return mp3s, covers, lrcs


def read_music_list():
    \"\"\"读取当前 music_list.js，本地不存在时从 R2 下载\"\"\"
    js_path = 'scripts/music_list.js'
    if not os.path.exists(js_path):
        # 本地无列表 → 从 R2 拉取
        from urllib.parse import quote
        r2_url = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/r2/buckets/{BUCKET}/objects/{quote("public/music/music_list.js", safe="")}'
        req = urllib.request.Request(r2_url, headers={'Authorization': f'Bearer {TOKEN}'})
        try:
            resp = urllib.request.urlopen(req)
            text = resp.read().decode('utf-8')
            os.makedirs(os.path.dirname(js_path), exist_ok=True)
            with open(js_path, 'w', encoding='utf-8') as f:
                f.write(text)
            print(f'📥 Downloaded music_list.js from R2')
        except Exception as e:
            print(f'⚠️  Cannot download music_list.js from R2: {e}')
            return []
    if not os.path.exists(js_path):
        return []
    with open(js_path, 'r', encoding='utf-8') as f:
        text = f.read()
    start = text.index('[')
    end = text.rindex(']')
    return json.loads(text[start:end+1])


def r2_file_exists(r2_path):
    """检查 R2 中对象是否存在"""
    from urllib.parse import quote
    url = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/r2/buckets/{BUCKET}/objects/{quote(r2_path, safe="")}'
    req = urllib.request.Request(url, method='HEAD', headers={'Authorization': f'Bearer {TOKEN}'})
    try:
        resp = urllib.request.urlopen(req)
        return resp.status == 200
    except:
        return False


def r2_key_from_src(src):
    """从 src 路径获取 R2 key"""
    if src.startswith('./public/music/'):
        return 'public/music/' + src[len('./public/music/'):]
    return None


def download_from_r2(r2_key, local_path):
    """从 R2 下载文件到本地"""
    from urllib.parse import quote
    url = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/r2/buckets/{BUCKET}/objects/{quote(r2_key, safe="")}'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {TOKEN}'})
    try:
        resp = urllib.request.urlopen(req)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, 'wb') as f:
            f.write(resp.read())
        return True
    except Exception as e:
        print(f'  ⚠️  Download        return False


def main():
    print('🔍 Syncing from R2...')

    # 1. List R2 objects
    r2_mp3s, r2_covers, r2_lrcs = list_r2_objects()
    print(f'📋 R2: {len(r2_mp3s)} MP3s, {len(r2_covers)} covers, {len(r2_lrcs)} LRCs')

    # 2. Read current music list
    songs = read_music_list()
    print(f'📂 Current list: {len(songs)} songs')

    # 3. Build known src map
    known_srcs = set()
    known_files = {}
    for s in songs:
        src = s.get('src', '')
        if src:
            known_srcs.add(src)
            known_files[src] = s

    # 4. Check each song for missing cover/lrc in R2
    need_redownload = []
    for s in songs:
        src_key = r2_key_from_src(s.get('src', ''))
        if not src_key:
            continue
        base_name = src_key.replace('.mp3', '')
        
        # Check cover
        cover_ref = s.get('cover', '')
        if cover_ref:
            cover_key = r2_key_from_src(cover_ref)
            if cover_key and cover_key not in r2_covers:
                print(f'  🗑️  Cover missing in R2: {cover_ref}')
                if src_key in r2_mp3s:
                    need_redownload.append(src_key)
                    print(f'     → Will re-download MP3 to re-extract cover')
                del s['cover']
        
        # Check LRC
        lrc_ref = s.get('lrc', '')
        if lrc_ref:
            lrc_key = r2_key_from_src(lrc_ref)
            if lrc_key and lrc_key not in r2_lrcs:
                print(f'  🗑️  LRC missing in R2: {lrc_ref}')
                if src_key in r2_mp3s:
                    need_redownload.append(src_key)
                    print(f'     → Will re-download MP3 to re-extract lyrics')
                del s['lrc']

    # 5. Download new MP3s (not in music list)
    downloaded = 0
    for r2_key in r2_mp3s:
        fname = r2_key[len(PREFIX):]
        src_path = f'./public/music/{fname}'
        if src_path in known_srcs:
            continue
        
        local_path = os.path.join(MUSIC_DIR, fname)
        print(f'⬇️  Downloading new: {fname}')
        if download_from_r2(r2_key, local_path):
            downloaded += 1

    # 6. Re-download MP3s with missing cover/lrc
    for r2_key in set(need_redownload):
        fname = r2_key[len(PREFIX):]
        local_path = os.path.join(MUSIC_DIR, fname)
        if not os.path.exists(local_path):
            print(f'⬇️  Re-downloading (missing assets): {fname}')
            if download_from_r2(r2_key, local_path):
                downloaded += 1

    # 7. Write back music_list.js with cleaned references
    if need_redownload:
        with open('scripts/music_list.js', 'w', encoding='utf-8') as f:
            f.write('var musicList = ' + json.dumps(songs, ensure_ascii=False, indent=2) + ';\n')
        with open('public/music/music_list.json', 'w', encoding='utf-8') as f:
            json.dump(songs, f, ensure_ascii=False, indent=2)
        print(f'📝 Updated music_list with cleaned references ({len(songs)} songs)')

    # Output status
    print(f'Downloaded: {downloaded} files')
    if downloaded > 0 or need_redownload:
        with open(os.environ.get('GITHUB_OUTPUT', '/dev/null'), 'a') as f:
            f.write('synced=true\n')
        print('✅ synced=true')
    else:
        with open(os.environ.get('GITHUB_OUTPUT', '/dev/null'), 'a') as f:
            f.write('synced=false\n')
        print('✅ synced=false')


if __name__ == '__main__':
    main()
