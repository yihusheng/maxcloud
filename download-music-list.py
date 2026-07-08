#!/usr/bin/env python3
"""从 R2 拉取当前 music_list.js（本地不存在时），确保 merge 时保留已有歌曲"""
import urllib.request, os

TOKEN = os.environ['CLOUDFLARE_API_TOKEN']
AID = os.environ['CLOUDFLARE_ACCOUNT_ID']
BUCKET = 'maxcloud'

encoded = __import__('urllib.parse').quote('public/music/music_list.js', safe='')
url = f'https://api.cloudflare.com/client/v4/accounts/{AID}/r2/buckets/{BUCKET}/objects/{encoded}'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {TOKEN}'})
try:
    resp = urllib.request.urlopen(req)
    text = resp.read().decode('utf-8')
    os.makedirs('scripts', exist_ok=True)
    with open('scripts/music_list.js', 'w', encoding='utf-8') as f:
        f.write(text)
    print('📥 Downloaded music_list.js from R2')
except Exception as e:
    print('⚠️ R2 not found, starting fresh')
