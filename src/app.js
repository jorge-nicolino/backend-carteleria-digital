const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./routes/auth.routes");
const contentRoutes = require("./routes/content.routes");
const playlistRoutes = require("./routes/playlist.routes");
const playerRoutes = require("./routes/player.routes");
const screenRoutes = require("./routes/screen.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/contents", contentRoutes);
app.use("/api/playlists", playlistRoutes);
app.use("/api/player", playerRoutes);
app.use("/api/screens", screenRoutes);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});