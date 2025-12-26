

const { fromBuffer } = require('file-type');
const BodyForm = require('form-data')
const axios = require('axios')



/**
 * Upload image to url
 * Supported mimetype:
 * - `image/jpeg`
 * - `image/jpg`
 * - `image/png`s
 * @param {Buffer} buffer Image Buffer
 */

async function tmpfiles(buffer) {
  const { ext, mime } = (await fromBuffer(buffer)) || {};
  const form = new BodyForm();
  form.append("file", buffer, { filename: `tmp.${ext}`, contentType: mime });
  try {
    const { data } = await axios.post("https://tmpfiles.org/api/v1/upload", form, {
      headers: form.getHeaders(),
    });   
    //console.log(data);  
    const match = /https?:\/\/tmpfiles.org\/(.*)/.exec(data.data.url);
    return `https://tmpfiles.org/dl/${match[1]}`;
  } catch (error) {
    throw error;
  }
};




async function reface(media) {
  try {
    const { ext, mime } = (await fromBuffer(media)) || {};
    
    const [n, d] = [Buffer.from(Buffer.from("0764d6c4c6e47595d665d636".split('').reverse().join(''),"hex").toString(),"base64").toString(),Buffer.from("dW5ib3JpbmcvYXBpL3YxL21lZGlhL2dldC11cGxvYWQtdXJs","base64").toString()]
    
    const { data } = await axios.post(`https://${n}/${d}`, {
      extension: ext || "jpeg"
    }, {
      headers: {
        'authority': n,
        'accept': 'application/json',
        'content-type': 'application/json',
        'origin': 'https://' + n,
        'referer': 'https://' + n,
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
      }
    });
    
    await axios.put(data.url, media, {
      headers: {
        "content-type": mime,
        "x-goog-content-length-range": data.content_length_range
      }
    })
    
    const rs = new URL(data.url)
    return rs.origin+rs.pathname
  } catch (error) {
    throw error
  }
}


module.exports = {
    tmpfiles,
    reface
}