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
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-zygote",
        "--disable-gpu",
        "--single-process"
      ]
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Open "More actions" menu (3 dots)
    await page.waitForSelector('button[aria-label^="More actions"]', { timeout: 15000 });
    await page.click('button[aria-label^="More actions"]');

    // Wait and find the "Show transcript" option
    await page.waitForSelector("ytd-menu-service-item-renderer", { timeout: 15000 });

    const items = await page.$$("ytd-menu-service-item-renderer");
    let clicked = false;
    for (const item of items) {
      const text = await item.evaluate(el => el.textContent?.trim().toLowerCase());
      if (text && text.includes("transcript")) {
        await item.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) throw new Error("Transcript button not found.");

    // Wait for transcript panel to load
    await page.waitForSelector("ytd-transcript-segment-renderer", { timeout: 15000 });

    const transcript = await page.$$eval("ytd-transcript-segment-renderer", segments =>
      segments
        .map(s => {
          const time = s.querySelector(".segment-timestamp")?.innerText || "";
          const text = s.querySelector(".segment-text")?.innerText || "";
          return `${time} - ${text}`.trim();
        })
        .filter(line => !!line)
        .join("\n")
    );

    if (!transcript) throw new Error("Transcript was empty.");

    console.log("✅ Transcript extracted.");
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
