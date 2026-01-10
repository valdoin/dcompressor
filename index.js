require("dotenv").config();
const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const { Client, GatewayIntentBits, AttachmentBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const app = express();
const PORT = 8080;

const TARGET_SIZE_BYTES = 9 * 1024 * 1024;
const MAX_DISCORD_LIMIT = 10 * 1024 * 1024;
const AUDIO_BITRATE = 64;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", () => console.log(`bot ready: ${client.user.tag}`));
client.login(process.env.DISCORD_TOKEN);

if (!fs.existsSync("temp")) fs.mkdirSync("temp");

const storage = multer.diskStorage({
  destination: "temp/",
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "clip-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.post("/upload", upload.array("videos", 20), (req, res) => {
  const { title } = req.body;

  if (!req.files || req.files.length === 0) return res.status(400).send("no files.");

  res.send("Received!");

  processVideos(req.files, title);
});

async function processVideos(files, title) {
  const outputPath = path.join("temp", `final_${Date.now()}.mp4`);
  const channel = await client.channels.fetch(process.env.CLIPS_CHANNEL_ID);

  if (!channel) {
    cleanup(files, null);
    return console.error("channel not found");
  }

  const msg = await channel.send(`⏳ cooking`);

  const getDuration = (filePath) => new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
          if (err) resolve(0);
          else resolve(metadata.format.duration);
      });
  });

  let totalDuration = 0;
  try {
      for (const file of files) {
          totalDuration += await getDuration(file.path);
      }
  } catch (e) {
      console.error(e);
  }

  const totalBitrateKbps = (TARGET_SIZE_BYTES * 8) / totalDuration / 1000;
  let videoBitrate = Math.floor(totalBitrateKbps - AUDIO_BITRATE);
  if (videoBitrate < 100) videoBitrate = 100;

  let complexFilter = [];
  let inputs = [];

  files.forEach((file, index) => {
      complexFilter.push(
          `[${index}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:-1:-1,setsar=1,fps=30[v${index}];` +
          `[${index}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${index}]`
      );
      inputs.push(`[v${index}][a${index}]`);
  });

  const concatFilter = `${inputs.join('')}concat=n=${files.length}:v=1:a=1[v][a]`;
  let finalFilterString = complexFilter.join(';');
  finalFilterString += `;${concatFilter}`;

  const command = ffmpeg();
  files.forEach(f => command.input(f.path));

  command
      .complexFilter(finalFilterString, ['v', 'a'])
      .outputOptions([
          `-b:v ${videoBitrate}k`,
          `-maxrate ${videoBitrate}k`,
          `-bufsize ${videoBitrate * 2}k`,
          `-b:a ${AUDIO_BITRATE}k`,
          '-c:v libx264',
          '-preset veryfast',
          '-movflags +faststart'
      ])
      .save(outputPath)
      .on('end', async () => {
          const stats = fs.statSync(outputPath);
          
          if (stats.size > MAX_DISCORD_LIMIT) {
             msg.edit(`failed: Too big (${(stats.size/1024/1024).toFixed(2)}MB)`);
             cleanup(files, outputPath);
             return;
          }

          try {
              const attachment = new AttachmentBuilder(outputPath, { name: `montage.mp4` });
              await channel.send({ 
                  content: `🎬 **${title}**`, 
                  files: [attachment] 
              });
              msg.delete().catch(() => {});
          } catch (e) {
              console.error(e);
              msg.edit("Discord API error");
          }
          cleanup(files, outputPath);
      })
      .on('error', (err) => {
          console.error("FFmpeg error:", err);
          msg.edit("FFmpeg processing error");
          cleanup(files, outputPath);
      });
}

function cleanup(files, outputPath) {
    if (files) {
        files.forEach(f => {
            if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        });
    }
    if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
}

app.listen(PORT, () => console.log(`web server running on port ${PORT}`));