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

  const interval = 10, width = 160, thumbHeight = 90;
  const maxThumbs = 100; // 10x10 layout target

  let progressData = { total: maxThumbs, generated: 0 };
  fs.writeFileSync(statusJson, JSON.stringify(progressData));

  const thumbs = [];
  for (let i = 0; i < maxThumbs; i++) {
    const time = i * interval;
    const outputPath = path.join(thumbsDir, `thumb${i}.jpg`);
    try {
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
          .on('error', () => resolve()) // Skip missing frame
          .save(outputPath);
      });
    } catch (e) {}
  }

  if (thumbs.length === 0) {
    throw new Error("No thumbnails could be generated.");
  }

  const gridCols = 10;
  const gridRows = Math.ceil(thumbs.length / gridCols);

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(`concat:${thumbs.join('|')}`)
      .inputOptions('-f', 'image2pipe')
      .inputFormat('image2')
      .outputOptions(`-vf tile=${gridCols}x${gridRows}`)
      .on('end', resolve)
      .on('error', reject)
      .save(sprite);
  });

  let vttContent = "WEBVTT\n\n";
  for (let i = 0; i < thumbs.length; i++) {
    const start = formatTime(i * interval);
    const end = formatTime((i + 1) * interval);
    const x = i % gridCols;
    const y = Math.floor(i / gridCols);
    const xPos = x * width;
    const yPos = y * thumbHeight;

    vttContent += `${start} --> ${end}\n`;
    vttContent += `${path.basename(sprite)}#xywh=${xPos},${yPos},${width},${thumbHeight}\n\n`;
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
