/**
 * Tide.fm metadata embedding Worker
 * Handles M4A (MP4) and MP3 (ID3v2.3) cover/title/lyrics embedding off the main thread.
 *
 * Receives: { id, audio, cover, title, description }
 * Returns:  { id, result, ext, mime }
 */

self.onmessage = function (e) {
  const { id, audio, cover, title, description } = e.data;
  try {
    const data = new Uint8Array(audio);
    const magic = data.slice(0, 12);
    const isM4A = magic[4]===0x66&&magic[5]===0x74&&magic[6]===0x79&&magic[7]===0x70;
    const isID3 = magic[0]===0x49&&magic[1]===0x44&&magic[2]===0x33;

    let result, ext, mime;
    if (isM4A) {
      result = embedM4A(audio, cover, title, description);
      ext = 'm4a'; mime = 'audio/mp4';
    } else {
      result = embedMP3(audio, cover, title, description);
      ext = 'mp3'; mime = 'audio/mpeg';
    }
    self.postMessage({ id, result, ext, mime }, [result]);
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};

// ═══════════════════════════════════════════════════════
// M4A / MP4 Atom Embedding
// ═══════════════════════════════════════════════════════

function embedM4A(audioBuf, coverBuf, title, lyrics) {
  const data = new Uint8Array(audioBuf);
  const moov = findAtom(data, 0, data.length, 'moov');
  if (!moov) throw new Error('moov atom not found');

  const moovKids = parseAtoms(data, moov.start + 8, moov.start + moov.size);

  // Build ilst items
  const ilstItems = [];
  if (title) ilstItems.push(makeTextItem('©nam', title));
  ilstItems.push(makeTextItem('©ART', 'Tide'));
  if (lyrics) ilstItems.push(makeTextItem('©lyr', lyrics));
  if (coverBuf) {
    const coverBytes = new Uint8Array(coverBuf);
    ilstItems.push(makeCovrItem(coverBytes, detectImageMime(coverBytes)));
  }
  const ilstAtom = packAtom('ilst', concat(ilstItems));

  // meta: version(1)+flags(3) + hdlr + ilst
  const hdlrAtom = packAtom('hdlr', makeHdlrPayload());
  const metaInner = concat([hdlrAtom, ilstAtom]);
  const metaPayload = new Uint8Array(4 + metaInner.length);
  metaPayload.set(metaInner, 4);
  const metaAtom = packAtom('meta', metaPayload);
  const udtaAtom = packAtom('udta', metaAtom);

  // Rebuild moov
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
  const name = 'MetadataHandler'; // 15 bytes → pad to 16
  const p = new Uint8Array(4 + 4 + 4 + 12 + 16);
  p[8]=0x6D; p[9]=0x64; p[10]=0x69; p[11]=0x72; // 'mdir'
  for (let i = 0; i < name.length; i++) p[24+i] = name.charCodeAt(i);
  return p;
}

function makeTextItem(key, value) {
  const val = encodeUTF8(value);
  const dataAtomSize = 16 + val.length; // header(8) + type(4) + locale(4) + value
  const item = new Uint8Array(8 + dataAtomSize);
  writeBE32(item, 0, 8);
  item[4]=key.charCodeAt(0); item[5]=key.charCodeAt(1);
  item[6]=key.charCodeAt(2); item[7]=key.charCodeAt(3);
  writeBE32(item, 8, dataAtomSize);
  item[12]=0x64; item[13]=0x61; item[14]=0x74; item[15]=0x61; // 'data'
  item[16]=0; item[17]=0; item[18]=0; item[19]=1; // type=0x00000001 UTF-8
  item.set(val, 24);
  return item;
}

function makeCovrItem(imgBytes, mime) {
  const dataAtomSize = 16 + imgBytes.length;
  const item = new Uint8Array(8 + dataAtomSize);
  writeBE32(item, 0, 8);
  item[4]=0x63; item[5]=0x6F; item[6]=0x76; item[7]=0x72; // 'covr'
  writeBE32(item, 8, dataAtomSize);
  item[12]=0x64; item[13]=0x61; item[14]=0x74; item[15]=0x61;
  const imgType = mime === 'image/png' ? 0x0E : 0x0D;
  item[16]=0; item[17]=0; item[18]=0; item[19]=imgType;
  item.set(imgBytes, 24);
  return item;
}

function detectImageMime(bytes) {
  if (bytes[0]===0xFF && bytes[1]===0xD8) return 'image/jpeg';
  if (bytes[0]===0x89 && bytes[1]===0x50) return 'image/png';
  return 'image/jpeg';
}

// ═══════════════════════════════════════════════════════
// MP3 ID3v2.3 Embedding
// ═══════════════════════════════════════════════════════

function embedMP3(audioBuf, coverBuf, title, lyrics) {
  const frames = [];
  if (title) frames.push(makeID3TextFrame('TIT2', title));
  frames.push(makeID3TextFrame('TPE1', 'Tide'));
  if (lyrics) frames.push(makeID3USLTFrame(lyrics));
  if (coverBuf) {
    const coverBytes = new Uint8Array(coverBuf);
    frames.push(makeID3ApicFrame(coverBytes, detectImageMime(coverBytes)));
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
  const h = new Uint8Array(10);
  h[0]=0x49; h[1]=0x44; h[2]=0x33; // "ID3"
  h[3]=0x03; h[4]=0x00; // v2.3
  h[5]=0x00;
  h[6]=(size>>21)&0x7F; h[7]=(size>>14)&0x7F;
  h[8]=(size>>7)&0x7F; h[9]=size&0x7F;
  return h;
}

function makeID3TextFrame(id, text) {
  const textBytes = encodeUTF8(text);
  const frameSize = 1 + textBytes.length;
  const frame = new Uint8Array(10 + frameSize);
  frame[0]=id.charCodeAt(0); frame[1]=id.charCodeAt(1);
  frame[2]=id.charCodeAt(2); frame[3]=id.charCodeAt(3);
  writeBE32(frame, 4, frameSize);
  frame[8]=0; frame[9]=0;
  frame[10] = 0x03; // UTF-8
  frame.set(textBytes, 11);
  return frame;
}

function makeID3USLTFrame(lyrics) {
  // Unsynchronized Lyrics: encoding(1) + lang(3) + desc(null-term) + lyrics
  const descBytes = new Uint8Array(0);
  const lyricsBytes = encodeUTF8(lyrics);
  const contentLen = 1 + 3 + descBytes.length + 1 + lyricsBytes.length;
  const frame = new Uint8Array(10 + contentLen);
  frame[0]=0x55; frame[1]=0x53; frame[2]=0x4C; frame[3]=0x54; // 'USLT'
  writeBE32(frame, 4, contentLen);
  frame[8]=0; frame[9]=0;
  frame[10] = 0x03; // UTF-8 encoding
  frame[11]=0x7A; frame[12]=0x68; frame[13]=0x6F; // 'zho' Chinese
  frame.set(descBytes, 14);
  frame[14 + descBytes.length] = 0; // desc null-term
  frame.set(lyricsBytes, 14 + descBytes.length + 1);
  return frame;
}

function makeID3ApicFrame(imgBytes, mime) {
  const mimeBytes = encodeUTF8(mime);
  const descBytes = new Uint8Array(0);
  const contentLen = 1 + mimeBytes.length + 1 + 1 + descBytes.length + imgBytes.length;
  const frame = new Uint8Array(10 + contentLen);
  frame[0]=0x41; frame[1]=0x50; frame[2]=0x49; frame[3]=0x43; // 'APIC'
  writeBE32(frame, 4, contentLen);
  frame[8]=0; frame[9]=0;
  frame[10] = 0x03; // UTF-8
  let off = 11;
  frame.set(mimeBytes, off); off += mimeBytes.length; frame[off++] = 0;
  frame[off++] = 0x03; // front cover
  frame.set(descBytes, off); off += descBytes.length; frame[off++] = 0;
  frame.set(imgBytes, off);
  return frame;
}

// ═══════════════════════════════════════════════════════
// Shared Utilities
// ═══════════════════════════════════════════════════════

function findAtom(data, start, end, name) {
  let off = start;
  while (off < end - 8) {
    const size = (data[off]<<24)|(data[off+1]<<16)|(data[off+2]<<8)|data[off+3];
    const atomName = String.fromCharCode(data[off+4],data[off+5],data[off+6],data[off+7]);
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
    const size = (data[off]<<24)|(data[off+1]<<16)|(data[off+2]<<8)|data[off+3];
    const name = String.fromCharCode(data[off+4],data[off+5],data[off+6],data[off+7]);
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
  atom[4]=name.charCodeAt(0); atom[5]=name.charCodeAt(1);
  atom[6]=name.charCodeAt(2); atom[7]=name.charCodeAt(3);
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
  arr[off]=(val>>>24)&0xFF; arr[off+1]=(val>>>16)&0xFF;
  arr[off+2]=(val>>>8)&0xFF; arr[off+3]=val&0xFF;
}

function encodeUTF8(str) {
  return new TextEncoder().encode(str);
}
