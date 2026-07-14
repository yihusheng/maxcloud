#!/usr/bin/env python3
"""
酷狗KGM格式解密工具 (Kugou KGM File Decryptor)
基于: https://github.com/ghtz08/kugou-kgm-decoder

用法:
    python3 decrypt_kgm.py <输入文件> [输出文件]
    python3 decrypt_kgm.py *.kgm.flac

命名规则:
    周杰伦 - 晴天_HQ.kgm.flac  →  周杰伦 - 晴天.flac
    自动去除 _HQ _SQ _无损 _HiRes 等质量后缀
"""

import sys, os, glob, re as re_mod

# === 常量 ===

KGM_MAGIC = bytes([
    0x7c, 0xd5, 0x32, 0xeb, 0x86, 0x02, 0x7f, 0x4b,
    0xa8, 0xaf, 0xa6, 0x8e, 0x0f, 0xff, 0x99, 0x14,
    0x00, 0x04, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x00, 0x00,
])

HEADER_LEN = 1024
OWN_KEY_LEN = 17
KEY_SLOT_SIZE = 16

PUB_KEY_MEND = bytes([184, 213, 61, 178, 233, 175, 120, 140, 131, 51, 113, 81, 118, 160, 205, 55, 47, 62, 53, 141, 169, 190, 152, 183, 231, 140, 34, 206, 90, 97, 223, 104, 105, 137, 254, 165, 182, 222, 169, 119, 252, 200, 189, 189, 229, 109, 62, 90, 54, 239, 105, 78, 190, 225, 233, 102, 28, 243, 217, 2, 182, 242, 18, 155, 68, 208, 111, 185, 53, 137, 182, 70, 109, 115, 130, 6, 105, 193, 237, 215, 133, 194, 48, 223, 162, 98, 190, 121, 45, 98, 98, 61, 13, 126, 190, 72, 137, 35, 2, 160, 228, 213, 117, 81, 50, 2, 83, 253, 22, 58, 33, 59, 22, 15, 195, 178, 187, 179, 226, 186, 58, 61, 19, 236, 246, 1, 69, 132, 165, 112, 15, 147, 73, 12, 100, 205, 49, 213, 204, 76, 7, 1, 158, 0, 26, 35, 144, 191, 136, 30, 59, 171, 166, 62, 196, 115, 71, 16, 126, 59, 94, 188, 227, 0, 132, 255, 9, 212, 224, 137, 15, 91, 88, 112, 79, 251, 101, 216, 92, 83, 27, 211, 200, 198, 191, 239, 152, 176, 80, 79, 15, 234, 229, 131, 88, 140, 40, 44, 132, 103, 205, 208, 158, 71, 219, 39, 80, 202, 244, 99, 99, 232, 151, 127, 27, 75, 12, 194, 193, 33, 76, 204, 88, 245, 148, 82, 163, 243, 211, 224, 104, 244, 0, 35, 243, 94, 10, 123, 147, 221, 171, 18, 178, 19, 232, 132, 215, 167, 159, 15, 50, 76, 85, 29, 4, 54, 82, 220, 3, 243, 249, 78, 66, 233, 61, 97, 239, 124, 182, 179, 147, 80])

assert len(PUB_KEY_MEND) == 272


def load_key_table(key_path):
    """加载酷狗公钥表（支持 .bin 和 .xz 格式）"""
    with open(key_path, 'rb') as f:
        raw = f.read()
    if key_path.endswith('.xz'):
        import lzma
        raw = lzma.decompress(raw)
    return raw


def find_key():
    """查找密钥文件（优先 .bin，备选 .xz）"""
    for fname in ['kugou_key.bin', 'kugou_key.xz']:
        for base in [
            os.path.dirname(__file__),
            os.getcwd(),
            '/workspace',
        ]:
            path = os.path.join(base, fname)
            if os.path.exists(path):
                return path
    return os.path.join(os.path.dirname(__file__), 'kugou_key.xz')


def clean_filename(name):
    """清理文件名: 去除质量后缀, 标准化扩展名
    
    规则:
      *.《品质》.kgm.flac  →  *.flac
        e.g. 晴天_HQ.kgm.flac → 晴天.flac
    """
    # 去除 .kgm.flac / .kgm 后缀
    base = name
    for ext in ['.kgm.flac', '.kgm.mp3', '.kgma.flac', '.kgma.mp3', '.kgma', '.kgm']:
        if base.lower().endswith(ext):
            base = base[:-len(ext)]
            break
    
    # 去除质量后缀: _HQ, _SQ, _无损, _HiRes, _HD 等
    base = re_mod.sub(r'_(?:HQ|SQ|HiRes|HD|无损|高品质|标准|流畅)\s*$', '', base, flags=re_mod.IGNORECASE)
    base = re_mod.sub(r'\s*\([^)]*\)\s*$', '', base)  # 去除 (123kbps) 类后缀
    
    return base.strip() + '.flac'


def detect_format(data):
    """检测音频实际格式"""
    if data[:4] == b'fLaC':      return 'FLAC'
    if data[:4] == b'RIFF' and data[8:12] == b'WAVE': return 'WAV'
    if data[:3] == b'ID3':       return 'MP3'
    if data[:4] == b'OggS':      return 'OGG'
    if len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0:
        return 'MP3'
    return None


def decrypt_one(input_path, output_path, key_table, verbose=True):
    """解密单个 KGM 文件"""
    
    with open(input_path, 'rb') as f:
        data = f.read()

    if len(data) < HEADER_LEN:
        if verbose: print(f"  ✗ 文件过小 ({len(data)} 字节)")
        return False

    if data[:len(KGM_MAGIC)] != KGM_MAGIC:
        if verbose: print(f"  ✗ 无效的 KGM 文件")
        return False

    if verbose:
        print(f"  文件: {os.path.basename(input_path)} ({len(data):,} 字节)")
    
    # 提取 own_key (16字节来自偏移 0x1c-0x2b, 第17字节为0)
    own_key = bytearray(OWN_KEY_LEN)
    own_key[:16] = data[0x1c:0x2c]

    if verbose:
        print(f"  密钥: {own_key.hex()}")
    
    offset = HEADER_LEN
    audio_len = len(data) - offset

    with open(output_path, 'wb') as out:
        CHUNK = 512 * 1024
        processed = 0
        
        while processed < audio_len:
            end = min(processed + CHUNK, audio_len)
            chunk = bytearray(data[offset + processed: offset + end])
            clen = end - processed
            
            for j in range(clen):
                i = processed + j  # 绝对位置 (从音频数据起点算起)
                
                # ---- own_key 部分 ----
                ok = own_key[i % OWN_KEY_LEN] ^ chunk[j]
                ok = (ok ^ ((ok & 0x0f) << 4)) & 0xff
                
                # ---- pub_key 部分 ----
                slot = i // KEY_SLOT_SIZE
                pk_m = PUB_KEY_MEND[i % 272]
                pk_tbl = key_table[slot] if slot < len(key_table) else 0
                pk = (pk_m ^ pk_tbl) & 0xff
                pk = (pk ^ ((pk & 0x0f) << 4)) & 0xff
                
                chunk[j] = ok ^ pk
            
            out.write(chunk)
            processed = end
            
            if verbose and processed % (10 * 1024 * 1024) == 0:
                pct = 100 * processed // audio_len
                print(f"  进度: {processed}/{audio_len} ({pct}%)")
    
    # 验证输出格式
    with open(output_path, 'rb') as f:
        hdr = f.read(16)
    
    fmt = detect_format(hdr)
    if fmt:
        print(f"  格式: {fmt}")
        # 输出扩展名与格式不匹配时给出提示
        out_ext = os.path.splitext(output_path)[1].lower()
        expected_ext = '.' + fmt.lower()
        if out_ext != expected_ext:
            print(f"  ⚠ 输出扩展名 .{out_ext} 与实际格式 {fmt} 不一致")
            print(f"     建议扩展名: {expected_ext}")
    else:
        print(f"  ⚠ 未知格式 ({hdr[:8].hex()})")
    
    return True


def main():
    if len(sys.argv) < 2:
        print("用法:")
        print("  python3 decrypt_kgm.py <输入文件> [输出文件]")
        print("  python3 decrypt_kgm.py *.kgm.flac")
        print()
        print("示例:")
        print('  python3 decrypt_kgm.py "周杰伦 - 晴天_HQ.kgm.flac"')
        print('  python3 decrypt_kgm.py "song_HQ.kgm.flac" "song.flac"')
        print()
        print("命名规则: 晴天_HQ.kgm.flac → 晴天.flac")
        sys.exit(1)

    # 收集输入文件
    explicit_output = None
    inputs = []
    
    for i, arg in enumerate(sys.argv[1:], 1):
        if i == 2 and len(sys.argv) == 3 and not explicit_output:
            explicit_output = arg
        elif '*' not in arg and '?' not in arg:
            inputs.append(arg)
        else:
            inputs.extend(glob.glob(arg))

    if explicit_output and len(inputs) > 1:
        print("错误: 指定输出路径时只能处理一个文件")
        sys.exit(1)

    if not inputs:
        print("未找到匹配的文件")
        sys.exit(1)

    # 加载密钥表
    key_path = find_key()
    if not os.path.exists(key_path):
        print(f"错误: 密钥文件未找到: {key_path}")
        sys.exit(1)
    
    with open(key_path, 'rb') as f:
        key_table = f.read()
    print(f"密钥表: {len(key_table):,} 字节")

    success = 0
    failed = 0

    for idx, input_path in enumerate(inputs):
        # 确定输出路径
        if explicit_output:
            out_path = explicit_output
        else:
            out_name = clean_filename(os.path.basename(input_path))
            out_path = os.path.join(os.path.dirname(input_path) or '.', out_name)
        
        if os.path.abspath(input_path) == os.path.abspath(out_path):
            print("错误: 输入输出路径相同")
            sys.exit(1)

        print(f"\n[{idx+1}/{len(inputs)}] {os.path.basename(input_path)}")
        print(f"  → {os.path.basename(out_path)}")

        if decrypt_one(input_path, out_path, key_table):
            success += 1
            size = os.path.getsize(out_path)
            print(f"  ✓ 完成 ({size:,} 字节)")
        else:
            failed += 1

    print(f"\n{'='*40}")
    print(f"总计: {success} 成功, {failed} 失败 / {len(inputs)} 个文件")
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
