import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { AttachmentBuilder, TextChannel } from "discord.js";
import client from "./discordBot";
import { TARGET_SIZE_BYTES, MAX_DISCORD_LIMIT, AUDIO_BITRATE } from "./constants";

const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

export async function processVideos(files: Express.Multer.File[], title: string) {
    const startProcessTime = Date.now(); 
    const outputPath = path.join("temp", `final_${Date.now()}.mp4`);
    const channelId = process.env.CLIPS_CHANNEL_ID;

    console.log(`[PROCESS] demarrage du traitement...`);

    if (!channelId) {
        console.error("[ERREUR] CLIPS_CHANNEL_ID manquant dans .env");
        cleanup(files, null);
        return;
    }

    const channel = await client.channels.fetch(channelId) as TextChannel;
  
    if (!channel) {
      cleanup(files, null);
      return console.error("[ERREUR] channel discord introuvable");
    }
  
    const msg = await channel.send(`⏳ cooking`);
  
    const getDuration = (filePath: string): Promise<number> => new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) resolve(0);
            else resolve(metadata.format.duration || 0);
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
    
    if (totalDuration === 0) totalDuration = 1;
    console.log(`[PROCESS] durée totale du montage : ${totalDuration.toFixed(2)}s`);

    const totalBitrateKbps = (TARGET_SIZE_BYTES * 8) / totalDuration / 1000;
    let videoBitrate = Math.floor(totalBitrateKbps - AUDIO_BITRATE);
    if (videoBitrate < 100) videoBitrate = 100;

    console.log(`[FFMPEG] bitrate cible calculé : ${videoBitrate}k (audio: ${AUDIO_BITRATE}k)`);
  
    let complexFilter: string[] = [];
    let inputs: string[] = [];
  
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
        .on('start', (cmdLine) => {
            console.log(`[FFMPEG] encodage lancé`);
        })
        .on('end', async () => {
            const timeTaken = ((Date.now() - startProcessTime) / 1000).toFixed(1);
            console.log(`[FFMPEG] encodage terminé en ${timeTaken}s`);

            if (!fs.existsSync(outputPath)) {
                console.error(`[ERREUR] le fichier de sortie n'a pas été créé`);
                cleanup(files, outputPath);
                return;
            }

            const stats = fs.statSync(outputPath);
            const finalSizeMB = (stats.size / 1024 / 1024).toFixed(2);
            console.log(`[PROCESS] taille finale : ${finalSizeMB} MB`);
            
            if (stats.size > MAX_DISCORD_LIMIT) {
               console.warn(`[WARNING] fichier trop gros pour discord (${finalSizeMB} MB)`);
               msg.edit(`failed: too big (${finalSizeMB}MB)`);
               cleanup(files, outputPath);
               return;
            }
  
            try {
                console.log(`[DISCORD] envoi vers discord en cours...`);
                const attachment = new AttachmentBuilder(outputPath, { name: `montage.mp4` });
                await channel.send({ 
                    content: `🎬 **${title}**`, 
                    files: [attachment] 
                });
                msg.delete().catch(() => {});
                console.log(`[DISCORD] fichier envoyé `);
            } catch (e) {
                console.error(`[ERREUR DISCORD]`, e);
                msg.edit("Discord API error");
            }
            cleanup(files, outputPath);
        })
        .on('error', (err) => {
            console.error(`[ERREUR FFMPEG]`, err);
            msg.edit("ffmpeg processing error");
            cleanup(files, outputPath);
        });
}
  
function cleanup(files: Express.Multer.File[] | null, outputPath: string | null) {
    let count = 0;
    if (files) {
        files.forEach(f => {
            if (fs.existsSync(f.path)) {
                fs.unlinkSync(f.path);
                count++;
            }
        });
    }
    if (outputPath && fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
        count++;
    }
    console.log(`[CLEANUP] nettoyage : ${count} fichiers temp supprimés`);
}