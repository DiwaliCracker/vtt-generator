const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { generateThumbnails } = require('./utils/ffmpeg-helper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.send('🎞️ VTT Thumbnail Generator is running');
});

app.get('/generate', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).json({ error: 'Missing url parameter' });

  try {
    const { spritePath, vttPath, statusPath } = await generateThumbnails(videoUrl);
    res.json({
      sprite: `/public/${path.basename(spritePath)}`,
      vtt: `/public/${path.basename(vttPath)}`,
      status: `/progress/${path.basename(statusPath, '-status.json')}`
    });
  } catch (error) {
    console.error('Failed to process video:', error.message);
    res.status(500).json({ error: 'Failed to generate thumbnails' });
  }
});

app.get('/progress/:id', (req, res) => {
  const file = path.join(__dirname, 'public', `${req.params.id}-status.json`);
  if (fs.existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).json({ error: "Progress not found" });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
