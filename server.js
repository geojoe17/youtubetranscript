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
        "--window-size=1920,1080",
        "--lang=en-US,en;q=0.9",
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115 Safari/537.36"
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Expand description
    const moreBtn = await page.$('tp-yt-paper-button#more');
    if (moreBtn) await moreBtn.click();

    // Click "Show transcript"
    await page.waitForSelector('ytd-button-renderer[button-renderer][is-paper-button] a[href^="#"]', { timeout: 10000 });
    const showTranscriptBtn = await page.$x("//yt-formatted-string[contains(text(), 'Show transcript')]");
    if (showTranscriptBtn.length) {
      await showTranscriptBtn[0].click();
    } else {
      throw new Error("❌ 'Show transcript' button not found.");
    }

    // Wait for the transcript panel to render
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

    if (!transcript) throw new Error("❌ Transcript was empty.");

    return res.json({ transcript });
  } catch (err) {
    console.error("❌ Error fetching transcript:", err.message);
    return res.status(500).json({ error: err.message || "Failed to extract transcript." });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Puppeteer transcript service running on port ${PORT}`);
});
