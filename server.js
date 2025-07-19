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
        "--single-process",
        "--window-size=1280,800",
        "--lang=en-US,en;q=0.9",
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115 Safari/537.36"
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Expand description if "...more" exists
    const moreBtn = await page.$("#expand");
    if (moreBtn) {
      await moreBtn.click();
      await page.waitForTimeout(1000);
    }

    // Click "Show transcript" button in the description area
    await page.waitForSelector("tp-yt-paper-button", { timeout: 10000 });
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("tp-yt-paper-button"));
      const target = buttons.find(btn =>
        btn.textContent?.toLowerCase().includes("show transcript")
      );
      if (target) {
        target.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      return res.status(404).json({ error: "Transcript button not found." });
    }

    // Wait for transcript panel to appear
    await page.waitForSelector("ytd-transcript-segment-renderer", { timeout: 15000 });

    // Extract transcript
    const transcript = await page.$$eval("ytd-transcript-segment-renderer", segments =>
      segments
        .map(s => {
          const time = s.querySelector(".segment-timestamp")?.innerText.trim() || "";
          const text = s.querySelector(".segment-text")?.innerText.trim() || "";
          return time && text ? `${time} — ${text}` : null;
        })
        .filter(Boolean)
        .join("\n")
    );

    if (!transcript) {
      return res.status(500).json({ error: "Transcript extraction resulted in empty content." });
    }

    return res.json({ transcript });

  } catch (err) {
    console.error("❌ Error extracting transcript:", err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
