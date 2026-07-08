#!/usr/bin/env python3
"""上传 music_list.js 到 R2 根目录，播放器通过 /music_list.js 直接读取"""
import urllib.request, os
from urllib.parse import quote

TOKEN = os.environ['CLOUDFLARE_API_TOKEN']
AID = os.environ['CLOUDFLARE_ACCOUNT_ID']
BUCKET = 'maxcloud'

with open('scripts/music_list.js', 'r') as f:
    data = f.read()

encoded = quote('music_list.js', safe='')
url = f'https://api.cloudflare.com/client/v4/accounts/{AID}/r2/buckets/{BUCKET}/objects/{encoded}'
req = urllib.request.Request(url, data=data.encode('utf-8'), method='PUT',
    headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/javascript'})
resp = urllib.request.urlopen(req)
print(f'uploaded music_list.js ({resp.status})')
