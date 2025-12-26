

const express = require('express')
const app = express()
const port = process.env.PORT || 8080
const bodyParser = require('body-parser')
const authToken = process.env.authToken || null
const cors = require('cors')
const reqValidate = require('./reqValidate')

const Link = require("../lib/links")
const wadl = require("../lib/WAMediaDownload")
const up = require("../lib/uploader")


global.browserLength = 0
global.browserLimit = Number(process.env.browserLimit) || 20
global.timeOut = Number(process.env.timeOut || 60000)

app.use(bodyParser.json({}))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cors())

let server = app.listen(port, () => {
    console.log(`Server running on port ${port}`)
})
try {
    server.timeout = global.timeOut
} catch (e) {};


const links = new Link()



// starting create browser
if (process.env.SKIP_LAUNCH != 'true') require('./createBrowser')

// const getSource = require('./getSource')
// const solveTurnstileMin = require('./solveTurnstile.min')
// const solveTurnstileMax = require('./solveTurnstile.max')
// const wafSession = require('./wafSession')

// const [solveTurnstileMin, solveTurnstileMax, getSource, wafSession] = ['solveTurnstile.min', 'solveTurnstile.max', 'getSource', 'wafSession'].map(p => require(`./${p}`));


const mai = Object.fromEntries(['solveTurnstileMin', 'solveTurnstileMax', 'getSource', 'wafSession'].map(p => [p, require(`./${p}`)]))


app.post('/action', async (req, res) => {
    const data = req.body
    const check = reqValidate(data)

    if (check !== true) return res.status(400).json({
        code: 400,
        message: 'Bad Request',
        schema: check
    });
    if (authToken && data.authToken !== authToken) return res.status(401).json({
        code: 401,
        message: 'Unauthorized'
    });
    if (global.browserLength >= global.browserLimit) return res.status(429).json({
        code: 429,
        message: 'Too Many Requests',
        tag: 'ratelimit'
    });
    if (process.env.SKIP_LAUNCH != 'true' && !global.browser) return res.status(500).json({
        code: 500,
        message: 'The scanner is not ready yet. Please try again a little later.',
        tag: 'not-available'
    });

    var result = { code: 500 }
    global.browserLength++

    switch (data.mode) {
        case "source":
            result = await mai.getSource(data).then(res => { return { source: res, code: 200 } }).catch(err => { return { code: 500, message: err.message } })
            break;
        case "turnstile-min":
            result = await mai.solveTurnstileMin(data).then(res => { return { token: res, code: 200 } }).catch(err => { return { code: 500, message: err.message } })
            break;
        case "turnstile-max":
            result = await mai.solveTurnstileMax(data).then(res => { return { token: res, code: 200 } }).catch(err => { return { code: 500, message: err.message } })
            break;
        case "waf-session":
            result = await mai.wafSession(data).then(res => { return { ...res, code: 200 } }).catch(err => { return { code: 500, message: err.message } })
            break;
    }

    global.browserLength--
    res.status(result.code ?? 500).send(result)
})


// function crit(a, b, c) {
  // return links.create(c)(a, b)
// }

app.post("/api/shorturl", links.create("sh"))
app.post("/api/shorturl2", links.create(["sh", "storage"]))


app.get("/sh/:id", links.getlink())
app.get("/storage/:id", links.getlink())






app.post("/api/v1/wamedia", async (req, res) => {
  const { input, type, id } = req.body
  if (!input && !type) return res.status(403).send(links.html('unauth')); 
  
  try {
    const ree = await wadl({ ...input, type })
  
    const nn = await new Promise((resolve, reject) => {
      const chunks = [];
      ree.on('data', (chunk) => chunks.push(chunk));
      ree.on('end', () => resolve(Buffer.concat(chunks)));
      ree.on('error', (err) => reject(err));
    });

    const sh = await up.tmpfiles(nn)
    
    res.json({
      status: true,
      url: sh
    });
  } catch(e) {
    res.json({
      status: false,
      msg: e.message
    });
  }
})







app.get("/", (req, res) => {
  res.send({ msg: "Hello World" })
})


app.use((req, res) => {
  res.status(404).json({ code: 404, message: 'Not Found' })
})

