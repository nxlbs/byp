const { connect } = require("puppeteer-real-browser")
async function createBrowser() {
    try {
        if (global.finished == true) return

        global.browser = null

        // console.log('Launching the browser...');

        const { browser } = await connect({
            headless: false,
            args: [
                "--disable-blink-features=AutomationControlled",
                "--disable-features=IsolateOrigins,site-per-process",
                "--disable-site-isolation-trials",
                "--disable-web-security",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--disable-gpu",
                "--hide-scrollbars",
                "--mute-audio",
                "--disable-background-networking",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-breakpad",
                "--disable-component-extensions-with-background-pages",
                "--disable-extensions",
                "--disable-features=TranslateUI",
                "--disable-ipc-flooding-protection",
                "--disable-renderer-backgrounding",
                "--enable-features=NetworkService,NetworkServiceInProcess",
                "--force-color-profile=srgb",
                "--metrics-recording-only",
            ],
            ignoreDefaultArgs: ["--enable-automation"],
            turnstile: true,
            connectOption: { defaultViewport: null },
            disableXvfb: false,
        })

        console.log('Browser launched!');

        global.browser = browser;
        
        // console.log(browser)

        browser.on('disconnected', async () => {
            if (global.finished == true) return
            console.log('Browser disconnected');
            await new Promise(resolve => setTimeout(resolve, 3000));
            await createBrowser();
        })

    } catch (e) {
        console.log(e.message);
        if (global.finished == true) return
        await new Promise(resolve => setTimeout(resolve, 3000));
        await createBrowser();
    }
}
createBrowser()