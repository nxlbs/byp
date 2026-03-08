
const { connect } = require('puppeteer-real-browser');
const path = require('path');
const cheerio = require("cheerio");
const fs = require("fs");
const os = require("os");

/**
 * Membersihkan dan mengekstrak teks utama dari response HTML Google Gemini (async/folif)
 * @param {string} html 
 * @returns {string}
 */
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

/**
 * Melakukan query ke Google Gemini (g.ai) dengan gambar dan/atau teks
 * 
 * @param {Object} options
 * @param {string} [options.imagePath]      - Path ke file gambar (opsional)
 * @param {Buffer} [options.imageBuffer]    - Buffer gambar langsung (opsional, priority lebih tinggi dari path)
 * @param {string} [options.prompt]         - Teks prompt / pertanyaan (opsional)
 * @param {number} [options.timeout=60000]  - Timeout keseluruhan (ms)
 * @returns {Promise<{ success: boolean, text?: string, error?: string }>}
 */
async function runai({
    imagePath = null,
    imageBuffer = null,
    prompt = "",
    timeout = 60000
} = {}) {
    console.log("Memulai proses query ke Google Gemini...");

    let browser;
    let page;

    try {
        const connection = await connect({
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
            ],
            ignoreDefaultArgs: ["--enable-automation"],
            turnstile: true,
        });

        ({ page, browser } = connection);

        // ── Langkah 1: Buka halaman ───────────────────────────────────────
        await page.goto('https://g.ai?hl=id&gl=id', {
            waitUntil: 'domcontentloaded',
            timeout: 45000
        });

        // await page.waitForTimeout(2000);
        await new Promise(r => setTimeout(r, 2000));

        // ── Langkah 2: Upload gambar (jika ada) ───────────────────────────
        if (imagePath || imageBuffer) {
            console.log("Menyiapkan upload gambar...");

            let fileToUpload;

            if (imageBuffer) {
                const tmpPath = path.join(os.tmpdir(), `myimage-${Date.now()}.jpg`);
                fs.writeFileSync(tmpPath, imageBuffer);
                fileToUpload = tmpPath;
            } else if (imagePath) {
                if (!fs.existsSync(imagePath)) {
                    throw new Error(`File gambar tidak ditemukan: ${imagePath}`);
                }
                fileToUpload = path.resolve(imagePath);
            }

            const attachBtnSel = 'button[aria-label="Input lain"]';
            await page.waitForSelector(attachBtnSel, { visible: true, timeout: 20000 });

            await page.evaluate((sel) => {
                document.querySelector(sel)?.click();
            }, attachBtnSel);

            // await page.waitForTimeout(1200);
            await new Promise(r => setTimeout(r, 1200));

            const fileInputSel = 'input[type="file"]';
            const fileInput = await page.waitForSelector(fileInputSel, { timeout: 15000 });

            await fileInput.uploadFile(fileToUpload);
            console.log("Gambar berhasil di-upload.");

            // Cleanup temporary file jika dibuat dari buffer
            if (imageBuffer) fs.unlinkSync(fileToUpload);
        }

        // ── Langkah 3: Ketik prompt (jika ada) ─────────────────────────────
        if (prompt?.trim()) {
            console.log("Mengetik prompt...");
            await page.type('textarea', prompt.trim(), { delay: 25 });
        } else if (!imagePath && !imageBuffer) {
            throw new Error("Harus menyertakan minimal salah satu: gambar atau prompt.");
        }

        // await page.waitForTimeout(1000);
        await new Promise(r => setTimeout(r, 1000));

        // ── Langkah 4: Tekan Enter / submit ────────────────────────────────
        await page.keyboard.press('Enter');
        console.log("Query dikirim.");

        // ── Langkah 5: Menunggu & menangkap response async/folif ───────────
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
            return { success: true, text: capturedText };
        } else {
            // await page.screenshot({ path: 'gemini-timeout.png', fullPage: true });
            return { success: false, error: "Timeout menunggu response async/folif" };
        }

    } catch (err) {
        console.error("Error selama proses:", err.message);
        // if (page) await page.screenshot({ path: 'gemini-error.png', fullPage: true });
        return { success: false, error: err.message };
    } finally {
        if (browser) {
            await browser.close();
            console.log("Browser ditutup.");
        }
    }
}

module.exports = runai