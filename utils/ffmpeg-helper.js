const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

ffmpeg.setFfmpegPath(ffmpegPath);

async function generateThumbnails(videoUrl) {
  const id = uuidv4();
  const tmpVideo = path.join(__dirname, `../public/${id}.mp4`);
  const sprite = path.join(__dirname, `../public/${id}-sprite.jpg`);
  const vtt = path.join(__dirname, `../public/${id}.vtt`);

  const writer = fs.createWriteStream(tmpVideo);
  const response = await axios.get(videoUrl, { responseType: 'stream' });
  await new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  const tileX = 5, tileY = 5, interval = 10, width = 160;
  const totalThumbs = tileX * tileY;
  const thumbHeight = 90;

  await new Promise((resolve, reject) => {
    ffmpeg(tmpVideo)
      .outputOptions([
        `-vf fps=1/${interval},scale=${width}:${thumbHeight},tile=${tileX}x${tileY}`
      ])
      .on('end', resolve)
      .on('error', reject)
      .save(sprite);
  });

  let vttContent = "WEBVTT\n\n";
  let count = 0;
  for (let y = 0; y < tileY; y++) {
    for (let x = 0; x < tileX; x++) {
      const start = formatTime(count * interval);
      const end = formatTime((count + 1) * interval);
      const xPos = x * width;
      const yPos = y * thumbHeight;

      vttContent += `${start} --> ${end}\n`;
      vttContent += `${path.basename(sprite)}#xywh=${xPos},${yPos},${width},${thumbHeight}\n\n`;

      count++;
    }
  }

  fs.writeFileSync(vtt, vttContent);
  fs.unlinkSync(tmpVideo);

  return { spritePath: sprite, vttPath: vtt };
}

function formatTime(sec) {
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.000`;
}

function pad(num) {
  return num.toString().padStart(2, '0');
}

module.exports = { generateThumbnails };
