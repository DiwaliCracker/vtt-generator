const express = require('express');
const { generateThumbnails } = require('./utils/ffmpeg-helper');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use('/public', express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  res.send('VTT Thumbnail Generator is running');
});

app.get('/generate', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).send('Missing video URL');

  try {
    const { spritePath, vttPath } = await generateThumbnails(videoUrl);
    res.json({
      sprite: `/public/${path.basename(spritePath)}`,
      vtt: `/public/${path.basename(vttPath)}`
    });
  } catch (err) {
    res.status(500).send('Failed to process video: ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
