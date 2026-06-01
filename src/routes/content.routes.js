const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const { spawn } = require("child_process");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const sharp = require("sharp");
const supabase = require("../db");

const router = express.Router();

const MAX_UPLOAD_SIZE = 500 * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 10 * 60;
const FFMPEG_COMMANDS = [
    process.env.FFMPEG_PATH,
    ffmpegInstaller.path,
    "ffmpeg",
].filter(Boolean);
const VIDEO_SCALE_FILTER = "scale='if(gt(a,1280/720),min(1280,iw),-2)':'if(gt(a,1280/720),-2,min(720,ih))'";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"];

const {
    verifyToken,
    authorizeRoles,
} = require("../middleware/auth");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = "";
        const extension = path.extname(file.originalname).toLowerCase();

        if (file.mimetype.startsWith("image/")) {
            folder = "images";
        } else if (ALLOWED_VIDEO_EXTENSIONS.includes(extension)) {
            folder = "tmp";
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
    const extension = path.extname(file.originalname).toLowerCase();
    const isAllowedImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
    const isAllowedVideo = ALLOWED_VIDEO_EXTENSIONS.includes(extension);

    if (isAllowedImage || isAllowedVideo) {
        cb(null, true);
    } else {
        cb(new Error("Solo se permiten JPG, PNG, WEBP y videos MP4, MOV, AVI, MKV, WEBM o M4V"), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_UPLOAD_SIZE,
    },
});

function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args);
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        child.on("error", (error) => {
            if (error.code === "ENOENT") {
                reject(new Error(`No se encontro ${command}. Instalalo en el servidor para procesar videos.`));
                return;
            }

            reject(error);
        });

        child.on("close", (code) => {
            if (code === 0 || options.allowNonZeroExit) {
                resolve({ stdout, stderr, code });
                return;
            }

            const error = new Error(stderr || `${command} finalizo con codigo ${code}`);
            error.code = code;
            reject(error);
        });
    });
}

async function runFfmpeg(args, options = {}) {
    const errors = [];

    for (const command of FFMPEG_COMMANDS) {
        try {
            return await runCommand(command, args, options);
        } catch (error) {
            if (error.code === "EACCES" && path.isAbsolute(command)) {
                try {
                    await fsPromises.chmod(command, 0o755);
                    return await runCommand(command, args, options);
                } catch (retryError) {
                    errors.push(`${command}: ${retryError.message}`);
                    continue;
                }
            }

            errors.push(`${command}: ${error.message}`);

            if (!["EACCES", "ENOENT"].includes(error.code)) {
                throw error;
            }
        }
    }

    const error = new Error(
        "No se pudo ejecutar ffmpeg en el servidor. Verifica permisos del binario o configura FFMPEG_PATH."
    );
    error.details = errors;
    throw error;
}

async function getVideoDurationSeconds(filePath) {
    const { stdout, stderr } = await runFfmpeg([
        "-hide_banner",
        "-i",
        filePath,
    ], { allowNonZeroExit: true });

    const output = `${stdout}\n${stderr}`;
    const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);

    if (durationMatch) {
        const hours = parseInt(durationMatch[1], 10);
        const minutes = parseInt(durationMatch[2], 10);
        const seconds = parseFloat(durationMatch[3]);
        return hours * 3600 + minutes * 60 + seconds;
    }

    throw new Error("No se pudo obtener la duracion del video");

    /*
    try {
        const metadata = JSON.parse(stdout);
        const duration = Number(metadata.format?.duration);

        if (!Number.isFinite(duration)) {
            throw new Error("No se pudo obtener la duracion del video");
        }

        return duration;
    } catch (e) {
        // Intenta obtener duración usando ffmpeg stdout
        const durationMatch = stdout.match(/Duration: (\d+):(\d+):(\d+)/);
        if (durationMatch) {
            const hours = parseInt(durationMatch[1], 10);
            const minutes = parseInt(durationMatch[2], 10);
            const seconds = parseInt(durationMatch[3], 10);
            return hours * 3600 + minutes * 60 + seconds;
        }
        throw e;
    }
    */
}

async function optimizeVideo(inputPath, outputPath) {
    await runFfmpeg([
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-sn",
        "-dn",
        "-vf",
        `${VIDEO_SCALE_FILTER},format=yuv420p`,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "24",
        "-maxrate",
        "3M",
        "-bufsize",
        "6M",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        outputPath,
    ]);
}

async function optimizeImage(inputPath, outputPath, mimeType) {
    const sharpInstance = sharp(inputPath);

    if (mimeType === "image/webp") {
        await sharpInstance
            .webp({ quality: 82 })
            .toFile(outputPath);
    } else if (mimeType === "image/png") {
        await sharpInstance
            .png({ quality: 85, compressionLevel: 9 })
            .toFile(outputPath);
    } else {
        // JPEG - mejor compresión
        await sharpInstance
            .resize(1920, 1080, {
                fit: "inside",
                withoutEnlargement: true,
            })
            .jpeg({ quality: 85, progressive: true })
            .toFile(outputPath);
    }
}

async function createVideoThumbnail(inputPath, outputPath) {
    await runFfmpeg([
        "-y",
        "-i",
        inputPath,
        "-ss",
        "00:00:00.5",
        "-frames:v",
        "1",
        "-vf",
        VIDEO_SCALE_FILTER,
        "-q:v",
        "3",
        outputPath,
    ]);
}

async function moveFile(sourcePath, targetPath) {
    await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });

    try {
        await fsPromises.rename(sourcePath, targetPath);
    } catch (error) {
        if (error.code !== "EXDEV") {
            throw error;
        }

        await fsPromises.copyFile(sourcePath, targetPath);
        await fsPromises.unlink(sourcePath).catch(() => {});
    }
}

async function getFileSize(filePath) {
    try {
        const stats = await fsPromises.stat(filePath);
        return stats.size;
    } catch (error) {
        return null;
    }
}

async function prepareOptimizedImage(uploadedFile) {
    const imagesDir = path.join(__dirname, "../uploads/images");
    await fsPromises.mkdir(imagesDir, { recursive: true });

    const baseName = path.parse(uploadedFile.filename).name;
    const optimizedFilename = `${baseName}.webp`;
    const optimizedPath = path.join(imagesDir, optimizedFilename);

    try {
        // Convertir y optimizar a webp (mejor compresión)
        await optimizeImage(uploadedFile.path, optimizedPath, "image/webp");
        await fsPromises.unlink(uploadedFile.path).catch(() => {});
    } catch (error) {
        console.warn("No se pudo optimizar la imagen. Se conserva el archivo original:", error.message);
        await fsPromises.unlink(optimizedPath).catch(() => {});
        return {
            fileName: uploadedFile.filename,
            filePath: uploadedFile.path,
        };
    }

    return {
        fileName: optimizedFilename,
        filePath: optimizedPath,
    };
}

async function keepOriginalVideo(uploadedFile) {
    const videosDir = path.join(__dirname, "../uploads/videos");
    await fsPromises.mkdir(videosDir, { recursive: true });

    const originalExtension = path.extname(uploadedFile.filename).toLowerCase() || ".mp4";
    const baseName = path.parse(uploadedFile.filename).name;
    const originalFilename = `${baseName}${originalExtension}`;
    const originalPath = path.join(videosDir, originalFilename);

    await moveFile(uploadedFile.path, originalPath);

    return {
        durationSeconds: null,
        fileName: originalFilename,
        filePath: originalPath,
        thumbnailFilename: null,
        thumbnailPath: null,
    };
}

async function prepareOptimizedVideo(uploadedFile) {
    const videosDir = path.join(__dirname, "../uploads/videos");
    const thumbnailsDir = path.join(__dirname, "../uploads/thumbnails");
    await fsPromises.mkdir(videosDir, { recursive: true });
    await fsPromises.mkdir(thumbnailsDir, { recursive: true });

    let durationSeconds = null;

    try {
        durationSeconds = await getVideoDurationSeconds(uploadedFile.path);
    } catch (error) {
        console.warn("No se pudo calcular la duracion del video. Se continua con el archivo original:", error.message);
    }

    if (durationSeconds && durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
        throw new Error("El video supera la duracion maxima permitida de 10 minutos.");
    }

    const baseName = path.parse(uploadedFile.filename).name;
    const optimizedFilename = `${baseName}.mp4`;
    const thumbnailFilename = `${baseName}.jpg`;
    const optimizedPath = path.join(videosDir, optimizedFilename);
    const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);

    try {
        await optimizeVideo(uploadedFile.path, optimizedPath);
        await createVideoThumbnail(optimizedPath, thumbnailPath);
        await fsPromises.unlink(uploadedFile.path).catch(() => {});
    } catch (error) {
        console.warn("No se pudo optimizar el video. Se conserva el archivo original:", error.message);
        await fsPromises.unlink(optimizedPath).catch(() => {});
        await fsPromises.unlink(thumbnailPath).catch(() => {});
        return keepOriginalVideo(uploadedFile);
    }

    return {
        durationSeconds: durationSeconds ? Math.round(durationSeconds) : null,
        fileName: optimizedFilename,
        filePath: optimizedPath,
        thumbnailFilename,
        thumbnailPath,
    };
}

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
                await fsPromises.unlink(uploadedFile.path).catch(() => {});
                return res.status(400).json({ message: "El título es obligatorio" });
            }

            const isImage = uploadedFile.mimetype.startsWith("image/");
            const type = isImage ? "image" : "video";

            const preparedImage = isImage ? await prepareOptimizedImage(uploadedFile) : null;
            const preparedVideo = isImage ? null : await prepareOptimizedVideo(uploadedFile);
            const folder = isImage ? "images" : "videos";
            const fileName = isImage ? preparedImage.fileName : preparedVideo.fileName;
            const durationSeconds = isImage ? null : preparedVideo.durationSeconds;
            const finalPath = isImage ? preparedImage.filePath : preparedVideo.filePath;
            const originalSizeBytes = uploadedFile.size || null;
            const finalSizeBytes = await getFileSize(finalPath);

            const baseUrl = process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get("host")}`;

            const fileUrl = `${baseUrl}/uploads/${folder}/${encodeURIComponent(fileName)}`;

            const { data, error } = await supabase
                .from("contents")
                .insert([
                    {
                        title,
                        description: description || "",
                        type,
                        file_name: fileName,
                        file_url: fileUrl,
                        duration_seconds: durationSeconds,
                        is_active: true,
                    },
                ])
                .select()
                .single();

            if (error) {
                await fsPromises.unlink(uploadedFile.path).catch(() => {});
                if (preparedImage?.filePath) {
                    await fsPromises.unlink(preparedImage.filePath).catch(() => {});
                }
                if (preparedVideo?.filePath) {
                    await fsPromises.unlink(preparedVideo.filePath).catch(() => {});
                }
                if (preparedVideo?.thumbnailPath) {
                    await fsPromises.unlink(preparedVideo.thumbnailPath).catch(() => {});
                }
                return res.status(400).json({ message: error.message });
            }

            res.status(201).json({
                message: "Contenido subido correctamente",
                content: data,
                upload: {
                    original_size_bytes: originalSizeBytes,
                    final_size_bytes: finalSizeBytes,
                    saved_bytes: originalSizeBytes && finalSizeBytes ? Math.max(originalSizeBytes - finalSizeBytes, 0) : null,
                },
            });
        } catch (error) {
            console.error("Error subiendo contenido:", error);

            if (uploadedFile?.path) {
                await fsPromises.unlink(uploadedFile.path).catch(() => {});
            }

            if (error.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({
                    message: "El archivo es demasiado grande. Maximo permitido: 500 MB.",
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

                if (content.type === "video") {
                    const thumbnailName = `${path.parse(content.file_name).name}.jpg`;
                    const thumbnailPath = path.join(__dirname, "../uploads/thumbnails", thumbnailName);
                    await fsPromises.unlink(thumbnailPath).catch((unlinkError) => {
                        if (unlinkError.code !== "ENOENT") {
                            console.error("No se pudo eliminar miniatura:", unlinkError);
                        }
                    });
                }
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
