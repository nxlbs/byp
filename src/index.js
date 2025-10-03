const express = require('express')
const app = express()
const port = process.env.PORT || 7860
const bodyParser = require('body-parser')
const authToken = process.env.authToken || null
const cors = require('cors')
const reqValidate = require('./reqValidate')

global.browserLength = 0
global.browserLimit = Number(process.env.browserLimit) || 20
global.timeOut = Number(process.env.timeOut || 60000)

app.use(bodyParser.json({}))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cors())


if (process.env.SKIP_LAUNCH != 'true') require('./createBrowser')

const getSource = require('./getSource')
const solveTurnstileMin = require('./solveTurnstile.min')
const solveTurnstileMax = require('./solveTurnstile.max')
const wafSession = require('./wafSession')

app.get("/", (req, res) => {
  res.send({ msg: "Hello World" })
})

app.post('/action', async (req, res) => {

    const data = req.body

    const check = reqValidate(data)

    if (check !== true) return res.status(400).json({ code: 400, message: 'Bad Request', schema: check })

    if (authToken && data.authToken !== authToken) return res.status(401).json({ code: 401, message: 'Unauthorized' })

    if (global.browserLength >= global.browserLimit) return res.status(429).json({ code: 429, message: 'Too Many Requests' })

    if (process.env.SKIP_LAUNCH != 'true' && !global.browser) return res.status(500).json({ code: 500, message: 'The scanner is not ready yet. Please try again a little later.' })

    var result = { code: 500 }

    global.browserLength++

    switch (data.mode) {
        case "source":
            result = await getSource(data).then(res => { return { source: res, code: 200 } }).catch(err => { return { code: 500, message: err.message } })
            break;
        case "turnstile-min":
            result = await solveTurnstileMin(data).then(res => { return { token: res, code: 200 } }).catch(err => { return { code: 500, message: err.message } })
            break;
        case "turnstile-max":
            result = await solveTurnstileMax(data).then(res => { return { token: res, code: 200 } }).catch(err => { return { code: 500, message: err.message } })
            break;
        case "waf-session":
            result = await wafSession(data).then(res => { return { ...res, code: 200 } }).catch(err => { return { code: 500, message: err.message } })
            break;
    }

    global.browserLength--

    res.status(result.code ?? 500).send(result)
})



let desktopContext, mobileContext, desktopPage, mobilePage;

const utils = {
    async createBrowserContext(type = 'desktop') {
        if (type === 'desktop') {
            desktopContext = await browser.createBrowserContext();
            return desktopContext;
        } else {
            mobileContext = await browser.createBrowserContext();
            return mobileContext;
        }
    },

    async initializeDesktop() {
        if (!desktopPage) {
            if (!desktopContext) {
                await this.createBrowserContext('desktop');
            }

            desktopPage = await desktopContext.newPage();
            await desktopPage.setViewport({ width: 1920, height: 1080 });
            await desktopPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            await desktopPage.setRequestInterception(true);
            desktopPage.on('request', (request) => {
                const url = request.url();
                if (url.endsWith('.png') || url.endsWith('.jpg') || url.includes('google-analytics')) {
                    request.abort();
                } else {
                    request.continue();
                }
            });

            await desktopPage.goto('https://www.bratgenerator.com/', { 
                waitUntil: 'domcontentloaded', 
                timeout: 10000 
            });

            try {
                await desktopPage.click('#onetrust-accept-btn-handler', { timeout: 2000 });
            } catch { }

            await desktopPage.evaluate(() => setupTheme('white'));
            console.log('Desktop page initialized');
        }
    },

    async initializeMobile() {
        if (!mobilePage) {
            if (!mobileContext) {
                await this.createBrowserContext('mobile');
            }

            mobilePage = await mobileContext.newPage();
            
            // iPhone 13 viewport
            await mobilePage.setViewport({
                width: 390,
                height: 844,
                deviceScaleFactor: 3,
                isMobile: true,
                hasTouch: true
            });
            
            await mobilePage.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1');

            await mobilePage.setRequestInterception(true);
            mobilePage.on('request', (request) => {
                const url = request.url();
                if (url.endsWith('.png') || url.endsWith('.jpg') || url.includes('google-analytics')) {
                    request.abort();
                } else {
                    request.continue();
                }
            });

            await mobilePage.goto('https://www.bratgenerator.com/', { 
                waitUntil: 'domcontentloaded', 
                timeout: 10000 
            });
            
            // Apply iPhone font styles including emoji support
            await mobilePage.addStyleTag({
                content: `
                  * {
                    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", "Helvetica", "Arial", "Apple Color Emoji", sans-serif !important;
                    -webkit-font-smoothing: antialiased !important;
                    -moz-osx-font-smoothing: grayscale !important;
                  }
                  
                  body, input, textarea, button {
                    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", "Helvetica", "Arial", "Apple Color Emoji", sans-serif !important;
                  }
                `
            });

            try {
                await mobilePage.click('#onetrust-accept-btn-handler', { timeout: 2000 });
            } catch { }

            await mobilePage.evaluate(() => setupTheme('white'));
            console.log('Mobile page initialized');
        }
    },

    async initialize() {
        await this.initializeDesktop();
        await this.initializeMobile();
    },

    async generateBrat(text, type = 'desktop') {
        const page = type === 'iphone' ? mobilePage : desktopPage;
        
        if (!page) {
            throw new Error(`Page not initialized for type: ${type}`);
        }
        
        await page.evaluate(() => {
            document.querySelector('#textInput').value = '';
        });
        await page.type('#textInput', text, { delay: 0 });
        await page.waitForSelector('#textOverlay', { timeout: 3000 });
        const element = await page.$('#textOverlay');
        return element.screenshot();
    },

    async close() {
        if (desktopContext) await desktopContext.close();
        if (mobileContext) await mobileContext.close();
        // if (browser) await browser.close();
        console.log('Browser closed');
    }
};



app.get('/maker/brat', async (req, res) => {
    try {
        const { q, type } = req.query;
        if (!q) {
            return res.status(200).json({
                name: 'HD Bart Generator API',
                message: 'Parameter q di perlukan',
                version: '2.1.0',
                runtime: {
                    os: os.type(),
                    platform: os.platform(),
                    architecture: os.arch(),
                    cpuCount: os.cpus().length,
                    uptime: `${os.uptime()} seconds`,
                    memoryUsage: `${Math.round((os.totalmem() - os.freemem()) / 1024 / 1024)} MB used of ${Math.round(os.totalmem() / 1024 / 1024)} MB`
                }
            });
        }
        
        const imageBuffer = await utils.generateBrat(q, type);
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: false,
            message: 'Error generating image',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});




app.use((req, res) => {
  res.status(404).json({ code: 404, message: 'Not Found' })
})

if (process.env.NODE_ENV !== 'development') {
    let server = app.listen(port, async () => {
        console.log(`Server running on port ${port}`)
        await utils.initialize();
    })
    try {
        server.timeout = global.timeOut
    } catch (e) { }
}

if (process.env.NODE_ENV == 'development') module.exports = app
