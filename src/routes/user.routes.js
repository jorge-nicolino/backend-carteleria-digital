const express = require("express");
const bcrypt = require("bcryptjs");
const supabase = require("../db");

const router = express.Router();

const {
    verifyToken,
    authorizeRoles,
} = require("../middleware/auth");

const validRoles = ["admin", "marketing", "viewer"];

router.get(
    "/",
    verifyToken,
    authorizeRoles("admin"),
    async (req, res) => {
        const { data, error } = await supabase
            .from("users_app")
            .select("id, name, email, role, is_active, created_at")
            .order("created_at", { ascending: false });

        if (error) {
            return res.status(400).json({ message: error.message });
        }

        res.json(data);
    }
);

router.post(
    "/",
    verifyToken,
    authorizeRoles("admin"),
    async (req, res) => {
        try {
            const { name, email, password, role } = req.body;

            if (!name || !email || !password || !role) {
                return res.status(400).json({ message: "Todos los campos son obligatorios" });
            }

            if (!validRoles.includes(role)) {
                return res.status(400).json({ message: "Rol invalido" });
            }

            const password_hash = await bcrypt.hash(password, 10);

            const { data, error } = await supabase
                .from("users_app")
                .insert([
                    {
                        name,
                        email,
                        password_hash,
                        role,
                        is_active: true,
                    },
                ])
                .select("id, name, email, role, is_active, created_at")
                .single();

            if (error) {
                return res.status(400).json({ message: error.message });
            }

            res.status(201).json(data);
        } catch (error) {
            res.status(500).json({ message: "Error creando usuario" });
        }
    }
);

router.patch(
    "/:id",
    verifyToken,
    authorizeRoles("admin"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { name, email, role, is_active } = req.body;

            if (!name || !email || !role) {
                return res.status(400).json({ message: "Nombre, email y rol son obligatorios" });
            }

            if (!validRoles.includes(role)) {
                return res.status(400).json({ message: "Rol invalido" });
            }

            const { data, error } = await supabase
                .from("users_app")
                .update({
                    name,
                    email,
                    role,
                    is_active: Boolean(is_active),
                })
                .eq("id", id)
                .select("id, name, email, role, is_active, created_at")
                .single();

            if (error) {
                return res.status(400).json({ message: error.message });
            }

            res.json(data);
        } catch (error) {
            res.status(500).json({ message: "Error actualizando usuario" });
        }
    }
);

router.patch(
    "/:id/password",
    verifyToken,
    authorizeRoles("admin"),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { password } = req.body;

            if (!password || password.length < 6) {
                return res.status(400).json({
                    message: "La contrasena debe tener al menos 6 caracteres",
                });
            }

            const password_hash = await bcrypt.hash(password, 10);

            const { error } = await supabase
                .from("users_app")
                .update({ password_hash })
                .eq("id", id);

            if (error) {
                return res.status(400).json({ message: error.message });
            }

            res.json({ message: "Contrasena actualizada correctamente" });
        } catch (error) {
            res.status(500).json({ message: "Error actualizando contrasena" });
        }
    }
);

module.exports = router;
