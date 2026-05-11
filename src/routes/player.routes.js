const express = require("express");
const supabase = require("../db");

const router = express.Router();

router.get("/:deviceId", async (req, res) => {
    try {
        const { deviceId } = req.params;

        const { data: screen, error: screenError } = await supabase
            .from("screens")
            .select("*")
            .eq("device_id", deviceId)
            .eq("is_active", true)
            .single();

        if (screenError || !screen) {
            return res.status(404).json({
                message: "Pantalla no encontrada o inactiva",
            });
        }

        if (!screen.playlist_id) {
            return res.status(400).json({
                message: "La pantalla no tiene playlist asignada",
            });
        }

        await supabase
            .from("screens")
            .update({ last_connection: new Date().toISOString() })
            .eq("id", screen.id);

        const { data: items, error: itemsError } = await supabase
            .from("playlist_items")
            .select(`
        id,
        order_index,
        duration_seconds,
        contents (*)
        `)
            .eq("playlist_id", screen.playlist_id)
            .order("order_index", { ascending: true });

        if (itemsError) {
            return res.status(400).json({
                message: itemsError.message,
            });
        }

        res.json({
            screen: {
                id: screen.id,
                name: screen.name,
                location: screen.location,
                device_id: screen.device_id,
            },
            playlist_id: screen.playlist_id,
            items,
        });
    } catch (error) {
        console.error("Error en player:", error);
        res.status(500).json({
            message: "Error obteniendo datos del player",
        });
    }
});

module.exports = router;