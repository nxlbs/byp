
const { connect } = require('puppeteer-real-browser');
const path = require('path');
const cheerio = require("cheerio");
const fs = require("fs");
const os = require("os");



function parseHtml(html) {
    const $ = cheerio.load(html);

    // Hapus elemen yang tidak terlihat / tidak relevan
    $('script, style, noscript').remove();
    $('[style*="display:none"]').remove();
    $('[hidden]').remove();
    $('[aria-hidden="true"]').remove();
    $('[data-ved]').remove();
    $('svg, path').remove();

    // Hapus comment nodes yang disisipkan Google
    $.root().contents().each(function () {
        if (this.type === 'comment') {
            $(this).remove();
        }
    });

    // Ambil teks dari container utama jawaban (sesuaikan selector jika UI berubah)
    const textParts = $("div[data-target-container-id='5']")
        .map((i, el) => $(el).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter(Boolean);

    // Biasanya bagian terakhir adalah "Generate more" atau sejenis → kita buang
    if (textParts.length > 0) textParts.pop();

    return textParts.join("\n").trim();
}

function genTmp(p, e) {
  return `${os.tmpdir()}/${p}-${Date.now()}.${e}`
}

async function dess(page, path) {
  try {
    const tmpPath = genTmp(path, "jpg")
    await page.screenshot({ path: tmpPath, fullPage: true })
    return tmpPath
  } catch(e) {
    console.warn("Failed to screenshoot in this condition / path:", path, "/ error:", e)
  }
}

function createLink(mod, path) {
  const p = mod.links.createShortlink({
    req: mod.req,
    id: path.split("/").pop(),
    type: "temp",
    media: fs.readFileSync(path)
  })
  fs.unlinkSync(path);
  return p.r.url.replace('/short/', '/sh/')
}

async function runai({
    image = null,
    prompt = "",
    timeout = 60000,
    mod
} = {}) {
    console.log("Memulai proses query ke Google Gemini...");

    let context;
    let page;
    let fallback = {};

    try {
        // const connection = await connect({
            // headless: false,
            // args: [
                // "--disable-blink-features=AutomationControlled",
                // "--disable-features=IsolateOrigins,site-per-process",
                // "--disable-site-isolation-trials",
                // "--disable-web-security",
                // "--no-sandbox",
                // "--disable-setuid-sandbox",
                // "--disable-dev-shm-usage",
                // "--disable-accelerated-2d-canvas",
                // "--no-first-run",
                // "--no-zygote",
                // "--disable-gpu",
                // "--hide-scrollbars",
                // "--mute-audio",
                // "--disable-background-networking",
                // "--disable-background-timer-throttling",
                // "--disable-backgrounding-occluded-windows",
                // "--disable-breakpad",
                // "--disable-component-extensions-with-background-pages",
                // "--disable-extensions",
                // "--disable-features=TranslateUI",
                // "--disable-ipc-flooding-protection",
                // "--disable-renderer-backgrounding",
                // "--enable-features=NetworkService,NetworkServiceInProcess",
                // "--force-color-profile=srgb",
                // "--metrics-recording-only",
            // ],
            // ignoreDefaultArgs: ["--enable-automation"],
            // turnstile: true,
        // });

        // ({ page, browser } = connection);
        
        context = await global.browser.createBrowserContext().catch(_ => null);
        if (!context) throw new Error("Failed to create browser context");
        
        const page = await context.newPage();
        
        // ── Langkah 1: Buka halaman
        await page.goto(atob("aHR0cHM6Ly93d3cuZ29vZ2xlLmNvbS9zZWFyY2g/dWRtPTUwJmFlcD0xMSZobD1pZCZnbD1pZA=="), {
            waitUntil: 'domcontentloaded',
            timeout: 45000
        });

        // await page.waitForTimeout(2000);
        await new Promise(r => setTimeout(r, 2000));
        
        console.log("This page:", await page.url())
        const p1 = await dess(page, "thispage")
        if (mod) {
            fallback.step1 = createLink(mod, p1)
        }

        // ── Langkah 2: Upload gambar (jika ada)
        if (image) {
            console.log("Menyiapkan upload gambar...");

            const tmpPath = path.resolve(genTmp("myimage", "jpg"));
            console.log("Buffer length", image.length, "and path", tmpPath)
            fs.writeFileSync(tmpPath, Buffer.from(image));

            const attachBtnSel = 'button[aria-label="Input lain"]';
            await page.waitForSelector(attachBtnSel, { visible: true, timeout: 20000 });

            await page.evaluate((sel) => {
                document.querySelector(sel)?.click();
            }, attachBtnSel);

            // await page.waitForTimeout(1200);
            await new Promise(r => setTimeout(r, 2000));

            const fileInputSel = 'input[type="file"]';
            const fileInput = await page.waitForSelector(fileInputSel, { timeout: 15000 });

            await fileInput.uploadFile(tmpPath);
            console.log("Gambar berhasil di-upload.");
            await new Promise(r => setTimeout(r, 2500));
            
            console.log("Menunggu load image")
            await page.waitForSelector('div[role="button"][aria-label="File"]', { timeout: 15000 });
            console.log("Berhasil load image")

            // Cleanup temporary file jika dibuat dari buffer
            if (image) fs.unlinkSync(tmpPath);
        }

        // ── Langkah 3: Ketik prompt (jika ada)
        if (prompt?.trim()) {
            console.log("Mengetik prompt...");
            await page.type('textarea', prompt.trim(), { delay: 25 });
        } else if (!image) {
            throw new Error("Harus menyertakan minimal salah satu: gambar atau prompt.");
        }

        // await page.waitForTimeout(1000);
        await new Promise(r => setTimeout(r, 1000));
        const p2 = await dess(page, "prepare")
        if (mod) {
            fallback.step2 = createLink(mod, p2)
        }

        // ── Langkah 4: Tekan Enter / submit
        await page.keyboard.press('Enter');
        console.log("Query dikirim.");

        // ── Langkah 5: Menunggu & menangkap response async/folif
        let capturedText = null;

        const onResponse = async (res) => {
            if (res.url().includes('async/folif')) {
                try {
                    const html = await res.text();
                    capturedText = parseHtml(html);
                    console.log("═".repeat(30));
                    console.log("Hasil ekstraksi:\n" + capturedText);
                    console.log("═".repeat(30));
                } catch (e) {
                    console.warn("Gagal parse response folif:", e);
                }
            }
        };

        page.on('response', onResponse);

        // Tunggu maksimal 60 detik atau sampai dapat response
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (capturedText) break;
            // await page.waitForTimeout(800);
            await new Promise(r => setTimeout(r, 800));
        }

        page.off('response', onResponse);

        if (capturedText) {
        const p3 = await dess(page, "result")
        if (mod) {
            fallback.step3 = createLink(mod, p3)
        }
            return { success: true, text: capturedText, fallback };
        } else {
            // await page.screenshot({ path: 'gemini-timeout.png', fullPage: true });
            return { success: false, error: "Timeout menunggu response async/folif", fallback };
        }

    } catch (err) {
        console.error("Error selama proses:", err.message);
        // if (page) await page.screenshot({ path: 'gemini-error.png', fullPage: true });
        return { success: false, error: err.message, fallback };
    } finally {
        if (context) {
            await context.close();
            console.log("Browser ditutup.");
        }
    }
}


module.exports = runai