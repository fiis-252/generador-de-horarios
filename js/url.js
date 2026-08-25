const base62_charset =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const tobase62 = (num) => {
  if (num === 0n) return "0";
  let str = "";
  while (num > 0n) {
    str = base62_charset[Number(num % 62n)] + str;
    num /= 62n;
  }
  return str;
};

const frombase62 = (str) => {
  let num = 0n;
  for (let i = 0; i < str.length; i++) {
    num = num * 62n + BigInt(base62_charset.indexOf(str[i]));
  }
  return num;
};

const base64urlencode = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const base64urldecode = (str) => {
  console.log(str)
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

export const encodepayload = async (schedulearray) => {
  if (typeof CompressionStream === "undefined") {
    throw new Error("browser does not support native compression");
  }

  const minimaldata = schedulearray.map((s) => ({ c: s.code, s: s.section }));
  const stringified = JSON.stringify(minimaldata);
  const stream = new Blob([stringified]).stream();
  const compressedstream = stream.pipeThrough(
    new CompressionStream("deflate-raw"),
  );
  const buffer = await new Response(compressedstream).arrayBuffer();

  return base64urlencode(buffer);
};

export const decodepayload = async (base64url) => {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("browser does not support native decompression");
  }

  const buffer = base64urldecode(base64url);
  console.log(base64urlencode(buffer))
  const stream = new Blob([buffer]).stream();
  // console.log(stream)
  const decompressedstream = stream.pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  const text = await new Response(decompressedstream).text();
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("decompressed payload is not an array");
  }

  return parsed.map((item) => {
    if (!item.c || !item.s) throw new Error("malformed block in payload");
    return { code: item.c, section: item.s };
  });
};

export const buildlegacypointermatrix = (db) => {
  const rawlist = [];
  Object.keys(db).forEach((code) => {
    Object.keys(db[code].sections).forEach((sec) => {
      rawlist.push(`${code}_${sec}`);
    });
  });
  return rawlist.sort();
};

export const decodelegacyc = (base62str, pointermatrix) => {
  let payload = frombase62(base62str);
  const decoded = [];
  const bits_per_class = 13n;
  const mask_13_bit = (1n << bits_per_class) - 1n;
  const color_mask = 15n;

  while (payload > 0n) {
    const block = payload & mask_13_bit;
    const classid = Number(block >> 4n);

    const classkey = pointermatrix[classid];
    if (classkey) {
      const [code, section] = classkey.split("_");
      decoded.push({ code, section });
    }

    payload >>= bits_per_class;
  }
  return decoded;
};

export const decodelegacys = (statestr, db) => {
  const sessionmap = {};
  let masteridcounter = 0;

  Object.keys(db).forEach((code) => {
    Object.keys(db[code].sections).forEach((sec) => {
      db[code].sections[sec].forEach(() => {
        sessionmap[masteridcounter++] = { code, section: sec };
      });
    });
  });

  const decoded = [];
  const addedset = new Set();

  for (let i = 0; i < statestr.length; i += 6) {
    const block = statestr.slice(i, i + 6);
    if (block.length < 6) continue;

    const id = parseInt(block.slice(0, 2), 36);
    const pointerdata = sessionmap[id];

    if (pointerdata) {
      const uniquekey = `${pointerdata.code}_${pointerdata.section}`;
      if (!addedset.has(uniquekey)) {
        addedset.add(uniquekey);
        decoded.push({ code: pointerdata.code, section: pointerdata.section });
      }
    }
  }
  return decoded;
};
