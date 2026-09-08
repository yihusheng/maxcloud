/**
 * Tide.fm metadata embedding Worker
 * Handles M4A (MP4) and MP3 (ID3v2.3) cover/title embedding off the main thread.
 *
 * Receives: { id, audio: ArrayBuffer, cover: ArrayBuffer|null, title: string }
 * Returns:  { id, result: ArrayBuffer, ext: 'm4a'|'mp3', mime: string }
 */

self.onmessage = function (e) {
  const { id, audio, cover, title } = e.data;
  try {
    const data = new Uint8Array(audio);
    const magic = data.slice(0, 12);
    const isM4A = magic[4] === 0x66 && magic[5] === 0x74 && magic[6] === 0x79 && magic[7] === 0x70; // ftyp
    const isID3 = magic[0] === 0x49 && magic[1] === 0x44 && magic[2] === 0x33; // ID3

    let result, ext, mime;
    if (isM4A) {
      result = embedM4A(audio, cover, title);
      ext = 'm4a';
      mime = 'audio/mp4';
    } else if (isID3) {
      result = embedMP3(audio, cover, title);
      ext = 'mp3';
      mime = 'audio/mpeg';
    } else {
      // Fallback: try MP3 ID3 anyway
      result = embedMP3(audio, cover, title);
      ext = 'mp3';
      mime = 'audio/mpeg';
    }
    self.postMessage({ id, result, ext, mime }, [result]);
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};

// ═══════════════════════════════════════════════════════
// M4A / MP4 Atom Embedding
// ═══════════════════════════════════════════════════════

function embedM4A(audioBuf, coverBuf, title) {
  const data = new Uint8Array(audioBuf);
  const moov = findAtom(data, 0, data.length, 'moov');
  if (!moov) throw new Error('moov atom not found');

  // Parse moov children
  const moovKids = parseAtoms(data, moov.start + 8, moov.start + moov.size);

  // Build ilst payload
  const ilstItems = [];
  if (title) ilstItems.push(makeTextItem('©nam', title));
  ilstItems.push(makeTextItem('©ART', 'Tide'));
  if (coverBuf) {
    const coverBytes = new Uint8Array(coverBuf);
    const mime = detectImageMime(coverBytes);
    ilstItems.push(makeCovrItem(coverBytes, mime));
  }
  const ilstPayload = concat(ilstItems);
  const ilstAtom = packAtom('ilst', ilstPayload);

  // meta atom: version(1) + flags(3) + hdlr + ilst
  const hdlrPayload = makeHdlrPayload();
  const hdlrAtom = packAtom('hdlr', hdlrPayload);
  const metaInner = concat([hdlrAtom, ilstAtom]);
  // meta needs version(1 byte=0) + flags(3 bytes=0) before children
  const metaPayload = new Uint8Array(4 + metaInner.length);
  metaPayload.set(metaInner, 4);
  const metaAtom = packAtom('meta', metaPayload);

  // udta atom
  const udtaAtom = packAtom('udta', metaAtom);

  // Rebuild moov: keep existing children except udta, append new udta
  const newMoovParts = [];
  for (const kid of moovKids) {
    if (kid.name === 'udta') continue;
    newMoovParts.push(data.slice(kid.start, kid.start + kid.size));
  }
  newMoovParts.push(udtaAtom);
  const newMoov = packAtom('moov', concat(newMoovParts));

  // Rebuild file
  const before = data.slice(0, moov.start);
  const after = data.slice(moov.start + moov.size);
  const result = new Uint8Array(before.length + newMoov.length + after.length);
  result.set(before, 0);
  result.set(newMoov, before.length);
  result.set(after, before.length + newMoov.length);
  return result.buffer;
}

function makeHdlrPayload() {
  // version(1) + flags(3) + pre_defined(4) + handler_type(4) + reserved(12) + name(null-terminated)
  const name = 'MetadataHandler';
  const p = new Uint8Array(4 + 4 + 4 + 12 + name.length + 1);
  // p[0..3] = version+flags = 0x00000000 (already zero)
  // handler_type = 'mdir' at offset 8
  p[8] = 0x6D; p[9] = 0x64; p[10] = 0x69; p[11] = 0x72;
  // name at offset 24
  for (let i = 0; i < name.length; i++) p[24 + i] = name.charCodeAt(i);
  p[24 + name.length] = 0;
  return p;
}

function makeTextItem(key, value) {
  const valBytes = encodeUTF8(value);
  // data atom: size(4) + 'data'(4) + type(2) + reserved(2) + value
  const dataAtomSize = 8 + 4 + valBytes.length; // header + type+reserved + value
  const keySize = 8;
  const itemSize = keySize + dataAtomSize;
  const item = new Uint8Array(itemSize);

  // key atom
  item[0] = 0; item[1] = 0; item[2] = 0; item[3] = 8;
  item[4] = key.charCodeAt(0); item[5] = key.charCodeAt(1);
  item[6] = key.charCodeAt(2); item[7] = key.charCodeAt(3);

  // data atom
  writeBE32(item, 8, dataAtomSize);
  item[12] = 0x64; item[13] = 0x61; item[14] = 0x74; item[15] = 0x61; // 'data'
  item[16] = 0x00; item[17] = 0x01; // type: UTF-8
  // item[18..19] = reserved = 0
  item.set(valBytes, 20);
  return item;
}

function makeCovrItem(imgBytes, mime) {
  const imgType = mime === 'image/png' ? 14 : 13; // 13=JPEG, 14=PNG
  const dataAtomSize = 8 + 4 + imgBytes.length;
  const keySize = 8;
  const itemSize = keySize + dataAtomSize;
  const item = new Uint8Array(itemSize);

  // key: 'covr'
  item[0] = 0; item[1] = 0; item[2] = 0; item[3] = 8;
  item[4] = 0x63; item[5] = 0x6F; item[6] = 0x76; item[7] = 0x72;

  // data atom
  writeBE32(item, 8, dataAtomSize);
  item[12] = 0x64; item[13] = 0x61; item[14] = 0x74; item[15] = 0x61;
  item[16] = (imgType >> 8) & 0xFF; item[17] = imgType & 0xFF;
  item.set(imgBytes, 20);
  return item;
}

function detectImageMime(bytes) {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  return 'image/jpeg';
}

// ═══════════════════════════════════════════════════════
// MP3 ID3v2.3 Embedding
// ═══════════════════════════════════════════════════════

function embedMP3(audioBuf, coverBuf, title) {
  const frames = [];
  if (title) frames.push(makeID3TextFrame('TIT2', title));
  frames.push(makeID3TextFrame('TPE1', 'Tide'));
  if (coverBuf) {
    const coverBytes = new Uint8Array(coverBuf);
    const mime = detectImageMime(coverBytes);
    frames.push(makeID3ApicFrame(coverBytes, mime));
  }
  if (!frames.length) return audioBuf;

  const frameData = concat(frames);
  const header = makeID3v2Header(frameData.length);

  const result = new Uint8Array(header.length + frameData.length + audioBuf.byteLength);
  result.set(header, 0);
  result.set(frameData, header.length);
  result.set(new Uint8Array(audioBuf), header.length + frameData.length);
  return result.buffer;
}

function makeID3v2Header(size) {
  // ID3v2.3: "ID3" + version(2.3) + flags(0) + size(synchsafe)
  const h = new Uint8Array(10);
  h[0] = 0x49; h[1] = 0x44; h[2] = 0x33; // "ID3"
  h[3] = 0x03; h[4] = 0x00; // v2.3.0
  h[5] = 0x00; // flags
  h[6] = (size >> 21) & 0x7F;
  h[7] = (size >> 14) & 0x7F;
  h[8] = (size >> 7) & 0x7F;
  h[9] = size & 0x7F;
  return h;
}

function makeID3TextFrame(id, text) {
  const textBytes = encodeUTF8(text);
  const frameSize = 1 + textBytes.length; // encoding(1) + text
  const frame = new Uint8Array(10 + frameSize);
  // Frame ID
  frame[0] = id.charCodeAt(0); frame[1] = id.charCodeAt(1);
  frame[2] = id.charCodeAt(2); frame[3] = id.charCodeAt(3);
  // Size (big-endian, NOT synchsafe for frame size in v2.3)
  writeBE32(frame, 4, frameSize);
  // Flags
  frame[8] = 0; frame[9] = 0;
  // Encoding: UTF-8
  frame[10] = 0x03;
  frame.set(textBytes, 11);
  return frame;
}

function makeID3ApicFrame(imgBytes, mime) {
  const mimeBytes = encodeUTF8(mime);
  const descBytes = new Uint8Array(0); // empty description
  // content: encoding(1) + mime(null-term) + picType(1) + desc(null-term) + data
  const contentLen = 1 + mimeBytes.length + 1 + 1 + descBytes.length + imgBytes.length;
  const frame = new Uint8Array(10 + contentLen);
  // Frame ID: APIC
  frame[0] = 0x41; frame[1] = 0x50; frame[2] = 0x49; frame[3] = 0x43;
  writeBE32(frame, 4, contentLen);
  frame[8] = 0; frame[9] = 0;
  // Encoding
  frame[10] = 0x03; // UTF-8
  let off = 11;
  frame.set(mimeBytes, off); off += mimeBytes.length; frame[off++] = 0; // null-term
  frame[off++] = 0x03; // front cover
  frame.set(descBytes, off); off += descBytes.length; frame[off++] = 0; // null-term
  frame.set(imgBytes, off);
  return frame;
}

// ═══════════════════════════════════════════════════════
// Shared Utilities
// ═══════════════════════════════════════════════════════

function findAtom(data, start, end, name) {
  let off = start;
  while (off < end - 8) {
    const size = (data[off] << 24) | (data[off + 1] << 16) | (data[off + 2] << 8) | data[off + 3];
    const atomName = String.fromCharCode(data[off + 4], data[off + 5], data[off + 6], data[off + 7]);
    if (size < 8) return null;
    if (atomName === name) return { start: off, size };
    off += size;
  }
  return null;
}

function parseAtoms(data, start, end) {
  const atoms = [];
  let off = start;
  while (off < end - 8) {
    const size = (data[off] << 24) | (data[off + 1] << 16) | (data[off + 2] << 8) | data[off + 3];
    const name = String.fromCharCode(data[off + 4], data[off + 5], data[off + 6], data[off + 7]);
    if (size < 8 || off + size > end) break;
    atoms.push({ name, start: off, size });
    off += size;
  }
  return atoms;
}

function packAtom(name, payload) {
  const size = 8 + payload.length;
  const atom = new Uint8Array(size);
  writeBE32(atom, 0, size);
  atom[4] = name.charCodeAt(0); atom[5] = name.charCodeAt(1);
  atom[6] = name.charCodeAt(2); atom[7] = name.charCodeAt(3);
  atom.set(payload instanceof Uint8Array ? payload : new Uint8Array(payload), 8);
  return atom;
}

function concat(arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const result = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { result.set(a, off); off += a.length; }
  return result;
}

function writeBE32(arr, off, val) {
  arr[off] = (val >>> 24) & 0xFF;
  arr[off + 1] = (val >>> 16) & 0xFF;
  arr[off + 2] = (val >>> 8) & 0xFF;
  arr[off + 3] = val & 0xFF;
}

function encodeUTF8(str) {
  return new TextEncoder().encode(str);
}
