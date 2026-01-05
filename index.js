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

const TARGET_SIZE_BYTES = 9.5 * 1024 * 1024;
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
    cb(null, "raw-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

app.use(express.static(path.join(__dirname, "public")));

app.post("/upload", upload.single("video"), (req, res) => {
  const { username, title, startTime, endTime } = req.body;

  if (!req.file) return res.status(400).send("no file uploaded.");

  res.send("Received!");

  processVideo(req.file, username, title, parseFloat(startTime), parseFloat(endTime));
});

async function processVideo(file, username, title, start, end) {
  const inputPath = file.path;
  const outputPath = path.join("temp", `compressed_${file.filename}`);

  const channel = await client.channels.fetch(process.env.CLIPS_CHANNEL_ID);

  if (!channel) {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    return console.error("channel not found");
  }

  const msg = await channel.send(`⏳ cooking`);

  ffmpeg.ffprobe(inputPath, (err, metadata) => {
    if (err) {
      console.error(err);
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      return msg.edit(`invalid video file`);
    }

    const originalDuration = metadata.format.duration;

    let trimStart = 0;
    let trimDuration = originalDuration;
    let isTrimmed = false;

    if (!isNaN(start) && !isNaN(end) && end > start) {
      trimStart = start;
      trimDuration = end - start;
      isTrimmed = true;
    }

    const totalBitrateKbps = (TARGET_SIZE_BYTES * 8) / trimDuration / 1000;
    let videoBitrate = Math.floor(totalBitrateKbps - AUDIO_BITRATE);

    if (videoBitrate < 100) videoBitrate = 100;

    const ffmpegOptions = [
      `-b:v ${videoBitrate}k`,
      `-maxrate ${videoBitrate}k`,
      `-bufsize ${videoBitrate * 2}k`,
      `-b:a ${AUDIO_BITRATE}k`,
      "-c:v libx264",
      "-preset veryfast",
      "-movflags +faststart",
      "-r 30",
    ];

    if (isTrimmed) {
      ffmpegOptions.push(`-ss ${trimStart}`);
      ffmpegOptions.push(`-t ${trimDuration}`);
    }

    if (videoBitrate < 600) {
      ffmpegOptions.push("-vf scale=-2:480");
    } else if (videoBitrate < 1500) {
      ffmpegOptions.push("-vf scale=-2:720");
    } else {
      ffmpegOptions.push("-vf scale=-2:1080");
    }

    ffmpeg(inputPath)
      .outputOptions(ffmpegOptions)
      .save(outputPath)
      .on("end", async () => {
        const stats = fs.statSync(outputPath);
        if (stats.size > MAX_DISCORD_LIMIT) {
          msg.edit(
            `failed: ${(stats.size / 1024 / 1024).toFixed(2)}MB > 10MB.`
          );

          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          return;
        }

        try {
          const attachment = new AttachmentBuilder(outputPath, {
            name: `clip_${username}.mp4`,
          });
          await channel.send({
            content: `**${title} - ${username}**`,
            files: [attachment],
          });
          msg.delete().catch(() => {});
        } catch (e) {
          console.error(e);
          msg.edit(`discord API error (file rejected)`);
        }

        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      })
      .on("error", (err) => {
        console.error(err);
        msg.edit(`ffmpeg error`);
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      });
  });
}

app.listen(PORT, () => console.log(`web server running on port ${PORT}`));