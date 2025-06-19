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
  const thumbsDir = path.join(__dirname, `../public/${id}-thumbs`);
  const sprite = path.join(__dirname, `../public/${id}-sprite.jpg`);
  const vtt = path.join(__dirname, `../public/${id}.vtt`);
  const statusJson = path.join(__dirname, `../public/${id}-status.json`);

  fs.mkdirSync(thumbsDir);

  const writer = fs.createWriteStream(tmpVideo);
  const response = await axios.get(videoUrl, { responseType: 'stream' });
  await new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  const tileX = 5, tileY = 5, interval = 10, width = 160, thumbHeight = 90;
  const total = tileX * tileY;

  let progressData = { total, generated: 0 };
  fs.writeFileSync(statusJson, JSON.stringify(progressData));

  const thumbs = [];
  for (let i = 0; i < total; i++) {
    const time = i * interval;
    const outputPath = path.join(thumbsDir, `thumb${i}.jpg`);
    await new Promise((resolve, reject) => {
      ffmpeg(tmpVideo)
        .seekInput(time)
        .frames(1)
        .size(`${width}x${thumbHeight}`)
        .on('end', () => {
          thumbs.push(outputPath);
          progressData.generated++;
          fs.writeFileSync(statusJson, JSON.stringify(progressData));
          resolve();
        })
        .on('error', reject)
        .save(outputPath);
    });
  }

  // Merge to sprite image
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(`concat:${thumbs.join('|')}`)
      .inputOptions('-pattern_type', 'glob')
      .outputOptions(`-vf tile=${tileX}x${tileY}`)
      .on('end', resolve)
      .on('error', reject)
      .save(sprite);
  });

  // VTT generation
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

  return { spritePath: sprite, vttPath: vtt, statusPath: path.basename(statusJson) };
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
