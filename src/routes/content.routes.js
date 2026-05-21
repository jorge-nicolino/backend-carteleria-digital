const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const supabase = require("../db");

const router = express.Router();
const UPLOAD_DB_TIMEOUT_MS = Number(process.env.UPLOAD_DB_TIMEOUT_MS || 30000);

const {
    verifyToken,
    authorizeRoles,
} = require("../middleware/auth");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = "";

        if (file.mimetype.startsWith("image/")) {
            folder = "images";
        } else if (file.mimetype.startsWith("video/")) {
            folder = "videos";
        } else {
            return cb(new Error("Tipo de archivo no permitido"));
        }

        const uploadDir = path.join(__dirname, "../uploads", folder);
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + "-" + file.originalname.replace(/\s+/g, "-");
        cb(null, uniqueName);
    },
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "video/mp4"];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Solo se permiten JPG, PNG, WEBP y MP4"), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 300 * 1024 * 1024,
    },
});

router.get(
    "/",
    verifyToken,
    authorizeRoles("admin", "marketing", "viewer"),
    async (req, res) => {
        try {
            const { data, error } = await supabase
                .from("contents")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) {
                return res.status(400).json({ message: error.message });
            }

            res.json(data);
        } catch (error) {
            res.status(500).json({ message: "Error obteniendo contenidos" });
        }
    });

router.post(
    "/upload",
    verifyToken,
    authorizeRoles("admin", "marketing"),
    upload.single("file"),
    async (req, res) => {
        const uploadedFile = req.file;

        try {
            const { title, description } = req.body;

            if (!uploadedFile) {
                return res.status(400).json({ message: "No se subió ningún archivo" });
            }

            if (!title) {
                return res.status(400).json({ message: "El título es obligatorio" });
            }

            const isImage = uploadedFile.mimetype.startsWith("image/");
            const type = isImage ? "image" : "video";

            const folder = isImage ? "images" : "videos";

            const baseUrl = process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get("host")}`;

            const fileUrl = `${baseUrl}/uploads/${folder}/${encodeURIComponent(uploadedFile.filename)}`;
            const abortController = new AbortController();
            const abortTimeout = setTimeout(() => abortController.abort(), UPLOAD_DB_TIMEOUT_MS);

            const { data, error } = await supabase
                .from("contents")
                .insert([
                    {
                        title,
                        description: description || "",
                        type,
                        file_name: uploadedFile.filename,
                        file_url: fileUrl,
                        duration_seconds: null,
                        is_active: true,
                    },
                ])
                .select()
                .single()
                .abortSignal(abortController.signal);

            clearTimeout(abortTimeout);

            if (error) {
                await fsPromises.unlink(uploadedFile.path).catch(() => {});
                return res.status(400).json({ message: error.message });
            }

            res.status(201).json({
                message: "Contenido subido correctamente",
                content: data,
            });
        } catch (error) {
            console.error("Error subiendo contenido:", error);

            if (uploadedFile?.path) {
                await fsPromises.unlink(uploadedFile.path).catch(() => {});
            }

            if (error.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({
                    message: "El archivo es demasiado grande. Máximo permitido: 300 MB.",
                });
            }

            if (error.name === "AbortError") {
                return res.status(504).json({
                    message: "La base de datos tardo demasiado en responder. Intenta nuevamente.",
                });
            }

            res.status(500).json({
                message: error.message || "Error interno al subir contenido",
            });
        }
    });

router.delete(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "marketing"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { data: content } = await supabase
                .from("contents")
                .select("file_name, type")
                .eq("id", id)
                .single();

            await supabase
                .from("playlist_items")
                .delete()
                .eq("content_id", id);

            const { error } = await supabase
                .from("contents")
                .delete()
                .eq("id", id);

            if (error) {
                return res.status(400).json({ message: error.message });
            }

            if (content?.file_name && content?.type) {
                const folder = content.type === "image" ? "images" : "videos";
                const filePath = path.join(__dirname, "../uploads", folder, content.file_name);
                await fsPromises.unlink(filePath).catch((unlinkError) => {
                    if (unlinkError.code !== "ENOENT") {
                        console.error("No se pudo eliminar archivo:", unlinkError);
                    }
                });
            }

            res.json({ message: "Contenido eliminado correctamente" });
        } catch (error) {
            res.status(500).json({ message: "Error eliminando contenido" });
        }
    }
);

router.patch(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "marketing"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { title, description } = req.body;

            if (!title) {
                return res.status(400).json({
                    message: "El título es obligatorio",
                });
            }

            const { data, error } = await supabase
                .from("contents")
                .update({
                    title,
                    description: description || "",
                })
                .eq("id", id)
                .select()
                .single();

            if (error) {
                return res.status(400).json({
                    message: error.message,
                });
            }

            res.json({
                message: "Contenido actualizado correctamente",
                content: data,
            });
        } catch (error) {
            res.status(500).json({
                message: "Error actualizando contenido",
            });
        }
    });

module.exports = router;
