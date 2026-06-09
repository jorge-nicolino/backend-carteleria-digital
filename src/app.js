const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
require("dotenv").config();

const authRoutes = require("./routes/auth.routes");
const contentRoutes = require("./routes/content.routes");
const playlistRoutes = require("./routes/playlist.routes");
const playerRoutes = require("./routes/player.routes");
const screenRoutes = require("./routes/screen.routes");
const userRoutes = require("./routes/user.routes");
const supabase = require("./db");

const app = express();

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/contents", contentRoutes);
app.use("/api/playlists", playlistRoutes);
app.use("/api/player", playerRoutes);
app.use("/api/screens", screenRoutes);
app.use("/api/users", userRoutes);

app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
    maxAge: "7d",
    setHeaders: (res, filePath) => {
        res.setHeader("Cache-Control", "public, max-age=604800");

        if (filePath.includes(`${path.sep}videos${path.sep}`)) {
            const fileName = path.basename(filePath);
            const extension = path.extname(filePath).toLowerCase();
            const videoTypes = {
                ".mp4": "video/mp4",
                ".m4v": "video/mp4",
                ".mov": "video/quicktime",
                ".webm": "video/webm",
                ".avi": "video/x-msvideo",
                ".mkv": "video/x-matroska",
            };

            if (videoTypes[extension]) {
                res.setHeader("Content-Type", videoTypes[extension]);
                res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
            }
        }
    },
}));

app.use("/player-files", express.static(path.join(__dirname, "player")));

async function sendPlayerVideoDownload(req, res) {
    const { deviceId } = req.query;

    if (!deviceId) {
        return res.status(400).json({ message: "No se indico deviceId en la URL" });
    }

    const { data: screen, error: screenError } = await supabase
        .from("screens")
        .select("*")
        .eq("device_id", deviceId)
        .eq("is_active", true)
        .single();

    if (screenError || !screen) {
        return res.status(404).json({ message: "Pantalla no encontrada o inactiva" });
    }

    if (!screen.playlist_id) {
        return res.status(400).json({ message: "La pantalla no tiene playlist asignada" });
    }

    const { data: items, error: itemsError } = await supabase
        .from("playlist_items")
        .select(`
        id,
        order_index,
        contents (*)
        `)
        .eq("playlist_id", screen.playlist_id)
        .order("order_index", { ascending: true });

    if (itemsError) {
        return res.status(400).json({ message: itemsError.message });
    }

    const videoNumber = Number.parseInt(req.query.video || "1", 10);

    if (!Number.isInteger(videoNumber) || videoNumber < 1) {
        return res.status(400).json({ message: "El numero de video debe ser mayor o igual a 1" });
    }

    const videoContents = (items || [])
        .map((item) => item.contents)
        .filter((content) => content?.type === "video" && /\.mp4$/i.test(content.file_name || ""));
    const videoContent = videoContents[videoNumber - 1];

    if (!videoContent) {
        return res.status(404).json({ message: `La playlist no tiene un video MP4 descargable en la posicion ${videoNumber}` });
    }

    const videosDir = path.resolve(__dirname, "uploads", "videos");
    const filePath = path.resolve(videosDir, videoContent.file_name);

    if (!filePath.startsWith(`${videosDir}${path.sep}`) || !fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Archivo de video no encontrado" });
    }

    res.setHeader("Content-Type", "video/mp4");
    res.download(filePath, videoContent.file_name);
}

app.get("/player", async (req, res, next) => {
    if (req.query.download === "1" || req.query.format === "mp4") {
        try {
            await sendPlayerVideoDownload(req, res);
        } catch (error) {
            next(error);
        }
        return;
    }

    res.sendFile(path.join(__dirname, "player", "index.html"));
});

app.get("/", (req, res) => {
    res.json({
        message: "API Cartelería Digital funcionando",
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "carteleria-digital-backend",
    });
});

app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                message: "El archivo es demasiado grande. Maximo permitido: 500 MB.",
            });
        }

        return res.status(400).json({ message: error.message });
    }

    if (error) {
        return res.status(400).json({
            message: error.message || "Error procesando la solicitud",
        });
    }

    next();
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`Servidor backend corriendo en el puerto ${PORT}`);
});
