/**
 * Mengambil UID Token Qwen menggunakan instance global.browser yang sudah ada.
 * Menggunakan createBrowserContext untuk isolasi sesi.
 * * @returns {Promise<string>}
 */
function getQwenUidToken() {
    return new Promise(async (resolve, reject) => {
        // Verifikasi keberadaan instance browser
        if (!global.browser) {
            return reject(new Error("Global browser instance tidak ditemukan (global.browser is undefined)."));
        }

        let context;
        let page;

        try {
            // Membuat konteks browser baru (terisolasi)
            context = await global.browser.createBrowserContext();
            page = await context.newPage();

            // Navigasi ke target
            await page.goto("https://chat.qwen.ai/", { 
                waitUntil: "networkidle2",
                timeout: 30000 
            });

            // Injeksi script AWSC (AliCloud Security)
            await page.evaluate(() => {
                return new Promise((res, rej) => {
                    const script = document.createElement("script");
                    script.src = "https://g.alicdn.com/AWSC/AWSC/awsc.js";
                    script.onload = () => res("AWSC loaded");
                    script.onerror = () => rej("Gagal memuat AWSC");
                    document.head.appendChild(script);
                });
            });

            // Menunggu modul Baxia/FYModule dimuat
            await page.waitForFunction(
                () => window.__baxia__ && window.__baxia__.getFYModule, 
                { timeout: 15000 }
            );

            // Ekstraksi Token
            const uidToken = await page.evaluate(() => {
                const getStore = (e, t) => {
                    var r = window.__baxia__ || {};
                    return e ? r[e] || t : r;
                };

                const getUmidToken = () => {
                    var e = getStore("getFYModule", {});
                    return e && e.getUidToken ? e.getUidToken() || null : null;
                };

                return getUmidToken();
            });

            if (!uidToken) {
                throw new Error("Gagal mendapatkan UID Token: Token bernilai null");
            }

            resolve(uidToken);

        } catch (error) {
            reject(error);
        } finally {
            // Membersihkan konteks (menutup page dan konteks isolasi)
            // Ini penting agar memori Sensei tidak bocor (memory leak)
            if (context) {
                try {
                    await context.close();
                } catch (e) {
                    console.error("Gagal menutup context:", e);
                }
            }
        }
    });
}

module.exports = getQwenUidToken