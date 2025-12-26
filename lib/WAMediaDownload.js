

const Crypto = require('crypto');
const axios = require('axios');
const stream = require('stream');


const DEF_HOST = 'mmg.whatsapp.net';
const DEFAULT_ORIGIN = 'https://web.whatsapp.com';
const AES_CHUNK_SIZE = 16;

const MEDIA_HKDF_KEY_MAPPING = {
    audio: 'Audio',
    document: 'Document',
    gif: 'Video',
    image: 'Image',
    ppic: '',
    product: 'Image',
    ptt: 'Audio',
    sticker: 'Image',
    video: 'Video',
    'sticker-pack': 'Sticker Pack',
    'thumbnail-sticker-pack': 'Sticker Pack Thumbnail',
    'thumbnail-document': 'Document Thumbnail',
    'thumbnail-image': 'Image Thumbnail',
    'thumbnail-video': 'Video Thumbnail',
    'thumbnail-link': 'Link Thumbnail',
    'md-msg-hist': 'History',
    'md-app-state': 'App State',
    'product-catalog-image': '',
    'payment-bg-image': 'Payment Background',
    ptv: 'Video',
};


const hkdfInfoKey = (type) => {
    const hkdfInfo = MEDIA_HKDF_KEY_MAPPING[type];
    return `WhatsApp ${hkdfInfo} Keys`;
};


async function hkdf(buffer, expandedLength, info) {
    const inputKeyMaterial = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const salt = info.salt ? new Uint8Array(info.salt) : new Uint8Array(0);
    const infoBytes = info.info ? new TextEncoder().encode(info.info) : new Uint8Array(0);
    const importedKey = await crypto.subtle.importKey(
        'raw',
        inputKeyMaterial,
        { name: 'HKDF' },
        false,
        ['deriveBits'],
    );
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt,
            info: infoBytes,
        },
        importedKey,
        expandedLength * 8,
    );
    return Buffer.from(derivedBits);
}


/** generates all the keys required to encrypt/decrypt & sign a media message */
async function getMediaKeys(buffer, mediaType) {
    if (!buffer) {
        throw new Error('Cannot derive from empty media key');
    }
    if (typeof buffer === 'string') {
        buffer = Buffer.from(buffer.replace('data:base64,', ''), 'base64');
    }
    // expand using HKDF to 112 bytes, also pass in the relevant app info
    const expandedMediaKey = await hkdf(buffer, 112, {
        info: hkdfInfoKey(mediaType),
    });
    return {
        iv: expandedMediaKey.slice(0, 16),
        cipherKey: expandedMediaKey.slice(16, 48),
        macKey: expandedMediaKey.slice(48, 80),
    };
}


const toSmallestChunkSize = (num) => {
    return Math.floor(num / AES_CHUNK_SIZE) * AES_CHUNK_SIZE;
};


const getUrlFromDirectPath = (directPath) => `https://${DEF_HOST}${directPath}`;


const downloadContentFromMessage = async ({ mediaKey, directPath, url, type, opts = {} }) => {
    const downloadUrl = url || getUrlFromDirectPath(directPath);
    const keys = await getMediaKeys(mediaKey, type);
    return downloadEncryptedContent(downloadUrl, keys, opts);
    
    // let buffer = Buffer.from([])
    // for await (const chunk of gg) {
        // buffer = Buffer.concat([buffer, chunk])
    // }
    // return gg
};

const getHttpStream = async (url, options = {}) => {
    const fetched = await axios.get(url.toString(), {
        ...options,
        responseType: 'stream',
    });
    return fetched.data;
};

/**
 * Decrypts and downloads an AES256-CBC encrypted file given the keys.
 * Assumes the SHA256 of the plaintext is appended to the end of the ciphertext
 * */
const downloadEncryptedContent = async (
    downloadUrl,
    { cipherKey, iv },
    { startByte, endByte, options } = {},
) => {
    let bytesFetched = 0;
    let startChunk = 0;
    let firstBlockIsIV = false;
    // if a start byte is specified -- then we need to fetch the previous chunk as that will form the IV
    if (startByte) {
        const chunk = toSmallestChunkSize(startByte || 0);
        if (chunk) {
            startChunk = chunk - AES_CHUNK_SIZE;
            bytesFetched = chunk;
            firstBlockIsIV = true;
        }
    }
    const endChunk = endByte ? toSmallestChunkSize(endByte || 0) + AES_CHUNK_SIZE : undefined;
    const headers = {
        ...(options?.headers || {}),
        Origin: DEFAULT_ORIGIN,
    };
    if (startChunk || endChunk) {
        headers.Range = `bytes=${startChunk}-`;
        if (endChunk) {
            headers.Range += endChunk;
        }
    }
    // download the message
    const fetched = await getHttpStream(downloadUrl, {
        ...(options || {}),
        headers,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
    });
    let remainingBytes = Buffer.from([]);
    let aes;
    const pushBytes = (bytes, push) => {
        if (startByte || endByte) {
            const start =
                bytesFetched >= startByte ? undefined : Math.max(startByte - bytesFetched, 0);
            const end =
                bytesFetched + bytes.length < endByte
                    ? undefined
                    : Math.max(endByte - bytesFetched, 0);
            push(bytes.slice(start, end));
            bytesFetched += bytes.length;
        } else {
            push(bytes);
        }
    };
    const output = new stream.Transform({
        transform(chunk, _, callback) {
            let data = Buffer.concat([remainingBytes, chunk]);
            const decryptLength = toSmallestChunkSize(data.length);
            remainingBytes = data.slice(decryptLength);
            data = data.slice(0, decryptLength);
            if (!aes) {
                let ivValue = iv;
                if (firstBlockIsIV) {
                    ivValue = data.slice(0, AES_CHUNK_SIZE);
                    data = data.slice(AES_CHUNK_SIZE);
                }
                aes = Crypto.createDecipheriv('aes-256-cbc', cipherKey, ivValue);
                // if an end byte that is not EOF is specified
                // stop auto padding (PKCS7) -- otherwise throws an error for decryption
                if (endByte) {
                    aes.setAutoPadding(false);
                }
            }
            try {
                pushBytes(aes.update(data), (b) => this.push(b));
                callback();
            } catch (error) {
                callback(error);
            }
        },
        final(callback) {
            try {
                pushBytes(aes.final(), (b) => this.push(b));
                callback();
            } catch (error) {
                callback(error);
            }
        },
    });
    return fetched.pipe(output, { end: true });
};

module.exports = downloadContentFromMessage