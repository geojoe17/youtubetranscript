const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());

app.get("/transcript", async (req, res) => {
  const url = req.query.url;
  if (!url || !url.includes("youtube.com") && !url.includes("youtu.be")) {
    return res.status(400).json({ error: "Missing or invalid YouTube URL." });
  }

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Expand transcript panel
    await page.click('button[aria-label="Show transcript"]');
    await page.waitForSelector('ytd-transcript-renderer', { timeout: 10000 });

    // Extract transcript text
    const transcript = await page.$$eval('ytd-transcript-segment-renderer', nodes =>
      nodes.map(n => n.innerText).join("\n")
    );

    await browser.close();

    return res.json({ transcript });
  } catch (err) {
    console.error("❌ Error fetching transcript:", err);
    return res.status(500).json({ error: "Failed to extract transcript." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Puppeteer service listening on port ${PORT}`);
});
