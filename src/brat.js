function generateBrat({ text, type = 'desktop' }) {
    return new Promise(async (resolve, reject) => {
        if (!text) return reject("Missing text parameter");

        const context = await browser
            .createBrowserContext()
            .catch(() => null);

        if (!context) return reject("Failed to create browser context");

        let isResolved = false;

        const cl = setTimeout(async () => {
            if (!isResolved) {
                await context.close();
                reject("Timeout Error");
            }
        }, 30000);

        try {
            const page = await context.newPage();

            // Setup viewport based on type
            if (type === 'iphone') {
                await page.setViewport({
                    width: 390,
                    height: 844,
                    deviceScaleFactor: 3,
                    isMobile: true,
                    hasTouch: true
                });
                await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1');
            } else {
                await page.setViewport(config.viewport);
                await page.setUserAgent(config.userAgent);
            }

            // Request interception
            await page.setRequestInterception(true);
            page.on('request', (request) => {
                const url = request.url();
                if (url.endsWith('.png') || url.endsWith('.jpg') || url.includes('google-analytics')) {
                    request.abort();
                } else {
                    request.continue();
                }
            });

            await page.goto('https://www.bratgenerator.com/', {
                waitUntil: 'domcontentloaded',
                timeout: 10000
            });

            // Apply iPhone font styles if mobile
            if (type === 'iphone') {
                await page.addStyleTag({
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
            }

            try {
                await page.click('#onetrust-accept-btn-handler', { timeout: 2000 });
            } catch { }

            await page.evaluate(() => setupTheme('white'));

            // Fill text and take screenshot
            await page.evaluate(() => {
                document.querySelector('#textInput').value = '';
            });
            await page.type('#textInput', text, { delay: 0 });
            await page.waitForSelector('#textOverlay', { timeout: 3000 });
            const element = await page.$('#textOverlay');
            const imageBuffer = await element.screenshot();

            isResolved = true;
            clearTimeout(cl);
            await context.close();

            if (!imageBuffer) return reject("Failed to generate image");
            return resolve(imageBuffer);

        } catch (e) {
            console.log(e);

            if (!isResolved) {
                await context.close();
                clearTimeout(cl);
                reject(e.message);
            }
        }
    });
}


module.exports = generateBrat;