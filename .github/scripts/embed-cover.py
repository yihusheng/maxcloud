#!/usr/bin/env python3
"""嵌入封面图到 MP3 文件 (mutagen)"""
import sys
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, APIC

mp3_path = sys.argv[1]
cover_path = sys.argv[2]

audio = MP3(mp3_path, ID3=ID3)
with open(cover_path, 'rb') as f:
    audio.tags.delall('APIC')
    audio.tags.add(APIC(
        encoding=3,
        mime='image/jpeg',
        type=3,  # front cover
        desc='Cover',
        data=f.read()
    ))
audio.save()
print(f'Embedded cover: {mp3_path}')
