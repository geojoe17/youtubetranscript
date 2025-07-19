const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());

app.get("/transcript", async (req, res) => {
  const url = req.query.url;
  if (!url || !url.includes("youtube.com") && !url.includes("youtu.be")) {
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
        "--disable-gpu",
        "--no-zygote",
        "--single-process",
        "--window-size=1280,800",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log("⏳ Navigating...");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Scroll to trigger lazy content
    await autoScroll(page);
    console.log("✅ Scrolled");

    // Click "...more" in description if it exists
    const moreBtn = await page.$('tp-yt-paper-button#more');
    if (moreBtn) {
      await moreBtn.click();
      await page.waitForTimeout(1000);
      console.log("📝 Expanded description");
    }

    // Find and click "Show transcript"
    const [transcriptBtn] = await page.$x(
      "//ytd-button-renderer//a[contains(., 'Show transcript')]"
    );
    if (!transcriptBtn) {
      return res.status(404).json({ error: "❌ 'Show transcript' button not found." });
    }

    await transcriptBtn.click();
    console.log("▶️ Clicked transcript");

    // Wait for transcript panel
    await page.waitForSelector("ytd-transcript-segment-renderer", { timeout: 15000 });

    const transcript = await page.$$eval("ytd-transcript-segment-renderer", segments =>
      segments.map(s => {
        const time = s.querySelector(".segment-timestamp")?.innerText.trim() || "";
        const text = s.querySelector(".segment-text")?.innerText.trim() || "";
        return time && text ? `${time} — ${text}` : null;
      }).filter(Boolean).join("\n")
    );

    if (!transcript) {
      return res.status(500).json({ error: "Transcript extraction was empty." });
    }

    console.log("✅ Transcript fetched");
    return res.json({ transcript });

  } catch (err) {
    console.error("❌ Error extracting transcript:", err);
    return res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Scroll slowly to bottom
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.documentElement.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 150);
    });
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
