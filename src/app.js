const express = require("express");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
require("dotenv").config();

const authRoutes = require("./routes/auth.routes");
const contentRoutes = require("./routes/content.routes");
const playlistRoutes = require("./routes/playlist.routes");
const playerRoutes = require("./routes/player.routes");
const screenRoutes = require("./routes/screen.routes");
const userRoutes = require("./routes/user.routes");

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
    setHeaders: (res) => {
        res.setHeader("Cache-Control", "public, max-age=604800");
    },
}));

app.use("/player-files", express.static(path.join(__dirname, "player")));

app.get("/player", (req, res) => {
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
