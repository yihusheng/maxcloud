#!/usr/bin/env python3
"""R2 music_list.js 操作：下载（合并时保留）& 上传"""
import urllib.request, sys, os
from urllib.parse import quote

TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', '')
AID = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '')
BUCKET = 'maxcloud'

def download():
    if not TOKEN or not AID:
        print('⚠️  R2 credentials not set, starting fresh')
        return
    encoded = quote('music_list.js', safe='')
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
        print('⚠️  R2 not found, starting fresh')

def upload():
    if not TOKEN or not AID:
        print('❌ R2 credentials required for upload')
        sys.exit(1)
    with open('scripts/music_list.js', 'r') as f:
        data = f.read()
    encoded = quote('music_list.js', safe='')
    url = f'https://api.cloudflare.com/client/v4/accounts/{AID}/r2/buckets/{BUCKET}/objects/{encoded}'
    req = urllib.request.Request(url, data=data.encode('utf-8'), method='PUT',
        headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/javascript'})
    resp = urllib.request.urlopen(req)
    print(f'uploaded music_list.js ({resp.status})')

if __name__ == '__main__':
    cmds = {'download': download, 'upload': upload}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        print(f'Usage: python3 {sys.argv[0]} <{"|".join(cmds)}>')
        sys.exit(1)
    cmds[sys.argv[1]]()
