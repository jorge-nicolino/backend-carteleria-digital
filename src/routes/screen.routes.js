const express = require("express");
const supabase = require("../db");

const router = express.Router();

const {
    verifyToken,
    authorizeRoles,
} = require("../middleware/auth");

router.get(
    "/",
    verifyToken,
    authorizeRoles("admin"),
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
    authorizeRoles("admin"),
    async (req, res) => {
        try {
            const { name, location, device_id, playlist_id } = req.body;

            if (!name || !device_id) {
                return res.status(400).json({
                    message: "name y device_id son obligatorios",
                });
            }

            const { data, error } = await supabase
                .from("screens")
                .insert([
                    {
                        name,
                        location: location || "",
                        device_id,
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
    "/:id/assign-playlist",
    verifyToken,
    authorizeRoles("admin"),
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

module.exports = router;