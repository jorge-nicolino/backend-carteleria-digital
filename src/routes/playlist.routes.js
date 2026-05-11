const express = require("express");
const supabase = require("../db");

const router = express.Router();

const {
    verifyToken,
    authorizeRoles,
} = require("../middleware/auth");

// =========================
// CREAR PLAYLIST
// =========================
router.post(
    "/",
    verifyToken,
    authorizeRoles("admin", "marketing"),
    async (req, res) => {
        try {
            const { name, description } = req.body;

            if (!name) {
                return res.status(400).json({ message: "El nombre es obligatorio" });
            }

            const { data, error } = await supabase
                .from("playlists")
                .insert([
                    {
                        name,
                        description: description || "",
                    },
                ])
                .select()
                .single();

            if (error) {
                return res.status(400).json({ message: error.message });
            }

            res.status(201).json(data);
        } catch (error) {
            res.status(500).json({ message: "Error creando playlist" });
        }
    });

// =========================
// LISTAR PLAYLISTS
// =========================
router.get(
    "/",
    verifyToken,
    authorizeRoles("admin", "marketing", "viewer"),
    async (req, res) => {
        const { data, error } = await supabase
            .from("playlists")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            return res.status(400).json({ message: error.message });
        }

        res.json(data);
    });

// =========================
// AGREGAR CONTENIDO A PLAYLIST
// =========================
router.post(
    "/:id/items",
    verifyToken,
    authorizeRoles("admin", "marketing"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { content_id, order_index, duration_seconds } = req.body;

            if (!content_id) {
                return res.status(400).json({ message: "content_id requerido" });
            }

            const { data, error } = await supabase
                .from("playlist_items")
                .insert([
                    {
                        playlist_id: id,
                        content_id,
                        order_index: order_index || 0,
                        duration_seconds: duration_seconds || null,
                    },
                ])
                .select()
                .single();

            if (error) {
                return res.status(400).json({ message: error.message });
            }

            res.status(201).json(data);
        } catch (error) {
            res.status(500).json({ message: "Error agregando contenido" });
        }
    });

// =========================
// VER PLAYLIST CON CONTENIDOS
// =========================
router.get(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "marketing"),
    async (req, res) => {
        try {
            const { id } = req.params;

            const { data, error } = await supabase
                .from("playlist_items")
                .select(`
        id,
        order_index,
        duration_seconds,
        contents (*)
        `)
                .eq("playlist_id", id)
                .order("order_index", { ascending: true });

            if (error) {
                return res.status(400).json({ message: error.message });
            }

            res.json(data);
        } catch (error) {
            res.status(500).json({ message: "Error obteniendo playlist" });
        }
    });

// =========================
// ELIMINAR CONTENIDO DE PLAYLIST
// =========================
router.delete(
    "/items/:itemId",
    verifyToken,
    authorizeRoles("admin", "marketing"),
    async (req, res) => {
        try {
            const { itemId } = req.params;

            const { error } = await supabase
                .from("playlist_items")
                .delete()
                .eq("id", itemId);

            if (error) {
                return res.status(400).json({ message: error.message });
            }

            res.json({
                message: "Contenido eliminado de la playlist correctamente",
            });
        } catch (error) {
            res.status(500).json({
                message: "Error eliminando contenido de la playlist",
            });
        }
    });

module.exports = router;