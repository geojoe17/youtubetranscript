const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());

app.get("/transcript", async (req, res) => {
  const url = req.query.url;
  if (!url || !url.includes("youtube.com")) {
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
        "--window-size=1600,1000"
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Click "...more" to expand the description
    const moreBtn = await page.$('tp-yt-paper-button#more');
    if (moreBtn) {
      await moreBtn.click();
      await page.waitForTimeout(1000);
    }

    // Wait for and click the "Show transcript" button
    await page.waitForSelector('ytd-button-renderer.style-scope.ytd-video-description-transcript-section-renderer a[href^="#"]', { timeout: 10000 });
    const showTranscriptBtn = await page.$('ytd-button-renderer.style-scope.ytd-video-description-transcript-section-renderer a[href^="#"]');
    if (showTranscriptBtn) {
      await showTranscriptBtn.click();
      await page.waitForTimeout(1500); // Let the transcript panel render
    } else {
      throw new Error("Show transcript button not found.");
    }

    // Extract transcript from right-hand panel
    await page.waitForSelector("ytd-transcript-segment-renderer", { timeout: 15000 });
    const transcript = await page.$$eval("ytd-transcript-segment-renderer", segments =>
      segments.map(s => {
        const time = s.querySelector(".segment-timestamp")?.innerText || "";
        const text = s.querySelector(".segment-text")?.innerText || "";
        return `${time} — ${text}`.trim();
      }).filter(Boolean).join("\n")
    );

    if (!transcript) throw new Error("Transcript panel found but content was empty.");
    return res.json({ transcript });

  } catch (err) {
    console.error("❌ Error extracting transcript:", err.message);
    return res.status(500).json({ error: `Error extracting transcript: ${err.message}` });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Listening on port ${PORT}`);
});
