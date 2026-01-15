import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

import "./discordBot"; 
import { processVideos } from "./videoProcessor";

const app = express();
const PORT = 8080;

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

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

app.use(express.static(path.join(__dirname, "../public")));

app.post("/upload", upload.array("videos", 20), (req: Request, res: Response) => {
  const { title } = req.body;
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
      console.warn(`[UPLOAD] tentative d'upload vide`);
      res.status(400).send("no files");
      return;
  }

  const totalSizeMB = (files.reduce((acc, file) => acc + file.size, 0) / 1024 / 1024).toFixed(2);
  console.log(`[UPLOAD] nouvelle requête reçue`);
  console.log(`[UPLOAD] titre : "${title}"`);
  console.log(`[UPLOAD] contenu : ${files.length} fichiers (total: ${totalSizeMB} MB)`);

  res.send("received!");

  processVideos(files, title);
});

app.listen(PORT, () => console.log(`[SERVER] serveur pret sur le port ${PORT}`));