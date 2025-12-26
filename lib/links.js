

const axios = require('axios')
const crypto = require('crypto')

// Optional, you can delete it
const wamdl = require("./WAMediaDownload.js")

/*

type for....

- link
    > redirect to url target
- media
    > send media auto download in browser
- media2
    > send media stream likely play audio and video in browser
- temp
    > same with "media", but input "base64"
- temp2
    > same with "media2", but input "base64"
- wamedia
    > download and decrypt for media WhatsApp (Optional, you can delete it if you don't need it)

// =============================

# How to use

// Initialize (Must place in index.js)
const links = new Link()

// Enter a path that can be accessed, this is only "optional" because it can be accessed via ID.
// Path used from result create
app.post("/api/shorturl", links.create("sh"))

If your multiple array result url
app.post("/api/shorturl", links.create(["sh", "storage"]))

// Input from path. (You can customize the path you want as you wish)
app.get("/sh/:id", links.getlink)
app.get("/storage/:id", links.getlink)


// If you need add from other code, you use this

const res = links.createShortlink({
  // Optional path custom if you needed
  id: Date.now(),
  
  // Require for type "link", "media", "media2"
  url: "https://example.com",
  
  // Input type for get
  type: "link",
  
  // Expiration from link, default 5 minutes (Input must minute format)
  exp: 5,
  
  // Delay before access link target (Optional)
  delay: 0,
  
  // Give name from auto download, for type "media" and "temp"
  name: "mycontent.txt",
  
  // Same with name, but give type mimetype
  mime: "application/txt",
  
  // Optional for input headers get type "media" and "media2"
  headers = null,
  
  // For type "temp" and "temp2", you can input media from buffer and base64
  media = null,
  base64 = "",
  
  // Give url result ('req' object from express required)
  path = "short" 
})

console.log("Your id path", res.r.id)

*/


class Link {
  constructor(db = {}) {
    this.db = db;
    this.type = ['link', 'media', 'media2', 'wamedia', 'temp', 'temp2'];
  }
  
  templateHtml({ title, subject, desc }) {
    return `<!DOCTYPE html><html><head><title>${title}</title></head><body><h1>${subject}</h1><p>${desc}</p><hr><p><i>nginx/1.21.80 (Trinity)</i></p></body></html>`
  }
  
  html(type, data) {
    if (type === 'error') {
      return this.templateHtml({
        title: `500 Error`,
        subject: `500 Error`,
        desc: `The server does not return data.</p><br><p>Error : ${data.message}`
      })
    } else if (type === 'notfound') {
      return this.templateHtml({
        title: `404 Not Found`,
        subject: `404 Not Found`,
        desc: `The requested URL was not found on this server.`
      })
    } else if (type == 'unauth') {
      return this.templateHtml({
        title: `403 Unauthorized`,
        subject: `403 Unauthorized`,
        desc: `This path is temporarily unavailable.`
      })
    }
  }
  
  // Generate ID like "a1b2c3d4"
  generateId() {
    return crypto.randomBytes(4).toString('hex'); 
  }
  
  // Create a shortlink and save it to memory links
  createShortlink({ req, url, type, id, exp = 5, delay = 5, name = '', mime = '', headers = null, media = null, base64 = "", path = "short" }) {

    // Use custom ID if you have one, otherwise generate a new ID.
    const ids = id || this.generateId();
  
    // Check if the ID is already in use
    if (this.db[ids]) {
      return { s: false, c: 400, r: { msg: 'Custom ID already in use' } };
    }
  
    // Calculate expiration time and delay (default exp: 5 minutes, default delay: 5 seconds)
    const duration = (exp || 5) * 60 * 1000;
    const delayMs = (delay === null) ? 0 : ((delay || 5) * 1000);
    const now = Date.now();
    const expiresAt = now + duration;
    const availableAt = now + delayMs;
    
    if (!Array.isArray(path) || typeof path !== 'string') {
      return { s: false, c: 500, r: { msg: 'Path must string type or array string' } };
    }

    // Save shortlink
    this.db[ids] = {
      url,
      media,
      base64,
      type,
      expiresAt,
      availableAt,
      name: name || '',
      mime: mime || '',
      headers: headers || null
    };
  
    // Auto delete after expiration
    setTimeout(() => {
      delete this.db[ids];
    }, duration);
    
    // Get url host (optional)
    const protocol = req?.protocol;
    const host = req?.headers?.host;
    
    const pth = Array.isArray(path) ? Object.fromEntries(path.map(p => [p, `${protocol}://${host}/${p}/${ids}`])) : `${protocol}://${host}/${path}/${ids}`;
    
    return {
      s: true,
      r: {
        id: ids,
        url: req ? pth : null,
      }
    }
  }
  
  create(path = "short") {
    return function (req, res) {
      const { url, type, exp, id, name, mime, headers, delay, input } = req.body;
      
      try {
      
      // Input validation
      if (!type || !this.type.includes(type)) {
        return res.status(400).json({
          status: false,
          message: 'Invalid request body, input url and please include type (link or media)'
        });
      }
      
      // Creating...
      const sh = this.createShortlink({ req, url, type, exp, id, name, mime, headers, delay, path })
      
      if (sh.s) {
        res.json({
          status: true,
          ...sh.r
        });
      } else {
        res.status(sh.c).send({
          status: false,
          ...sh.r
        })
      }
      } catch (e) {
        res.json({
          status: false,
          msg: e.message,
          stack: e.stack || null,
        })
      }
    }
  }
  
  async getlink(req, res) {
    const id = req.params.id
    const link = this.db[id];
    
    if (!link || link.expiresAt < Date.now()) {
      return res.status(404).send(this.html('notfound'));
    }
    
    if (Date.now() < link.availableAt) {
      return res.status(403).send(this.html('unauth'));
    }

    if (link.type === 'media') {
      try {
        const response = await axios({
          url: link.url,
          method: 'GET',
          responseType: 'stream',
          headers: {
            'user-agent': 'Mozilla/5.0 (Linux; Android 14; NX769J Build/UKQ1.230917.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.107 Mobile Safari/537.36',
            ...(link.headers ?? {})
          }
        });

        const contentType = response.headers['content-type'];
        const filename = `${link.name || id}`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', link.mime || contentType || 'application/octet-stream');
        response.data.pipe(res);
      } catch (error) {
        console.error(error);
        res.status(500).send(this.html('error', error));
      }
    } else if (link.type === 'media2') {
      try {
        const range = req.headers.range;
        
        const axiosRes = await axios.get(link.url, {
          responseType: "stream",
          headers: range ? { Range: range } : {},
        });
        
        res.writeHead(axiosRes.status, axiosRes.headers);
        axiosRes.data.pipe(res);
      } catch (err) {
        console.error(err.message);
        res.status(500).send(this.html('error', error));
      }
    } else if (link.type === 'temp') {
      const filename = `${link.name || id}`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', link.mime || 'image/png');
      if (link.base64) {
        res.send(Buffer.from(link.base64, "base64"))
      } else {
        res.send(link.media)
      }
    } else if (link.type === 'temp2') {
      res.type(`${id}`)
      if (link.base64) {
        res.send(Buffer.from(link.base64, "base64"))
      } else {
        res.send(link.media)
      }
    }
    
    // Optional, you can delete it
    else if (link.type === 'wamedia') {
      try {
        const ree = await wamdl(link.input)
        
        res.type(`${id}`)
       ree.pipe(res)
      } catch (err) {
        console.error(err.message);
        res.status(500).send(this.html('error', error));
      }
    }
    
    else {
      res.redirect(link.url);
    }
  }
}

module.exports = Link