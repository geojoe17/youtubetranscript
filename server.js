const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());

app.get("/transcript", async (req, res) => {
  const url = req.query.url;
  if (!url || (!url.includes("youtube.com") && !url.includes("youtu.be"))) {
    return res.status(400).json({ error: "Missing or invalid YouTube URL." });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Click "..." menu if needed
    try {
      const menuBtn = await page.$('button[aria-label^="More actions"]');
      if (menuBtn) await menuBtn.click();
    } catch (e) {
      console.warn("⚠️ Couldn't click more actions button.");
    }

    // Click "Show transcript" button
    await page.waitForSelector('ytd-menu-service-item-renderer', { timeout: 10000 });
    const items = await page.$$('ytd-menu-service-item-renderer');

    let clicked = false;
    for (const item of items) {
      const text = await item.evaluate(el => el.textContent.trim().toLowerCase());
      if (text.includes("transcript")) {
        await item.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) throw new Error("Transcript option not found.");

    // Wait for transcript renderer
    await page.waitForSelector('ytd-transcript-segment-renderer', { timeout: 15000 });

    const transcript = await page.$$eval(
      'ytd-transcript-segment-renderer',
      segments =>
        segments
          .map(s => {
            const time = s.querySelector('.segment-timestamp')?.innerText || "";
            const text = s.querySelector('.segment-text')?.innerText || "";
            return `${time} - ${text}`.trim();
          })
          .join('\n')
    );

    if (!transcript) throw new Error("Transcript extraction failed or empty.");

    return res.json({ transcript });
  } catch (err) {
    console.error("❌ Error fetching transcript:", err.message);
    return res.status(500).json({ error: "Failed to extract transcript." });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Puppeteer transcript service running on port ${PORT}`);
});
