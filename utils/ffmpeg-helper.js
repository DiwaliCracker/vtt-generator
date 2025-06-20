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

  const interval = 10; // seconds between frames
  const width = 160, thumbHeight = 90;
  const thumbs = [];
  let time = 0, index = 0;
  const progressData = { total: 0, generated: 0 };
  fs.writeFileSync(statusJson, JSON.stringify(progressData));

  // Extract as many thumbnails as possible
  while (true) {
    const outputPath = path.join(thumbsDir, `thumb${index}.jpg`);
    const result = await new Promise((resolve) => {
      ffmpeg(tmpVideo)
        .seekInput(time)
        .frames(1)
        .size(`${width}x${thumbHeight}`)
        .on('end', () => resolve(true))
        .on('error', () => resolve(false))
        .save(outputPath);
    });
    if (!result) break;
    thumbs.push(outputPath);
    index++;
    time += interval;
    progressData.total = index;
    progressData.generated = index;
    fs.writeFileSync(statusJson, JSON.stringify(progressData));
  }

  if (thumbs.length === 0) throw new Error("No thumbnails generated");

  const gridCols = Math.min(10, Math.ceil(Math.sqrt(thumbs.length)));
  const gridRows = Math.ceil(thumbs.length / gridCols);

  // Generate sprite
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

  // Create VTT
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
