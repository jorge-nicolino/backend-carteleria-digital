const express = require("express");
const supabase = require("../db");

const router = express.Router();

const {
    verifyToken,
    authorizeRoles,
} = require("../middleware/auth");

function createDeviceId() {
    return `screen-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}

router.get(
    "/",
    verifyToken,
    authorizeRoles("admin", "marketing"),
    async (req, res) => {
        const { data, error } = await supabase
            .from("screens")
            .select(`
      *,
        playlists (
        id,
        name
        )
    `)
            .order("created_at", { ascending: false });

        if (error) {
            return res.status(400).json({ message: error.message });
        }

        res.json(data);
    });

router.post(
    "/",
    verifyToken,
    authorizeRoles("admin", "marketing"),
    async (req, res) => {
        try {
            const { name, location, device_id, playlist_id } = req.body;

            if (!name) {
                return res.status(400).json({
                    message: "El nombre es obligatorio",
                });
            }

            const { data, error } = await supabase
                .from("screens")
                .insert([
                    {
                        name,
                        location: location || "",
                        device_id: device_id || createDeviceId(),
                        playlist_id: playlist_id || null,
                    },
                ])
                .select()
                .single();

            if (error) {
                return res.status(400).json({ message: error.message });
            }

            res.status(201).json({
                message: "Pantalla creada correctamente",
                screen: data,
            });
        } catch (error) {
            res.status(500).json({ message: "Error creando pantalla" });
        }
    });

router.patch(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "marketing"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { name, location, playlist_id } = req.body;

            if (!name) {
                return res.status(400).json({
                    message: "El nombre es obligatorio",
                });
            }

            const { data, error } = await supabase
                .from("screens")
                .update({
                    name,
                    location: location || "",
                    playlist_id: playlist_id || null,
                })
                .eq("id", id)
                .select()
                .single();

            if (error) {
                return res.status(400).json({ message: error.message });
            }

            res.json({
                message: "Pantalla actualizada correctamente",
                screen: data,
            });
        } catch (error) {
            res.status(500).json({ message: "Error actualizando pantalla" });
        }
    }
);

router.patch(
    "/:id/assign-playlist",
    verifyToken,
    authorizeRoles("admin", "marketing"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { playlist_id } = req.body;

            if (!playlist_id) {
                return res.status(400).json({
                    message: "playlist_id es obligatorio",
                });
            }

            const { data, error } = await supabase
                .from("screens")
                .update({ playlist_id })
                .eq("id", id)
                .select()
                .single();

            if (error) {
                return res.status(400).json({ message: error.message });
            }

            res.json({
                message: "Playlist asignada correctamente",
                screen: data,
            });
        } catch (error) {
            res.status(500).json({ message: "Error asignando playlist" });
        }
    });

router.delete(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "marketing"),
    async (req, res) => {
        try {
            const { id } = req.params;

            const { error } = await supabase
                .from("screens")
                .delete()
                .eq("id", id);

            if (error) {
                return res.status(400).json({ message: error.message });
            }

            res.json({ message: "Pantalla eliminada correctamente" });
        } catch (error) {
            res.status(500).json({ message: "Error eliminando pantalla" });
        }
    }
);

module.exports = router;
