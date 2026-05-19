const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const supabase = require("../db");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email y contraseña son obligatorios",
            });
        }

        const { data: user, error } = await supabase
            .from("users_app")
            .select("*")
            .eq("email", email)
            .eq("is_active", true)
            .single();

        if (error || !user) {
            return res.status(401).json({
                message: "Credenciales inválidas",
            });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({
                message: "Credenciales inválidas",
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
                name: user.name,
            },
            process.env.JWT_SECRET,
            { expiresIn: "8h" }
        );

        res.json({
            message: "Login correcto",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({
            message: "Error interno del servidor",
        });
    }
});

router.patch("/change-password", verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                message: "Contrasena actual y nueva son obligatorias",
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                message: "La nueva contrasena debe tener al menos 6 caracteres",
            });
        }

        const { data: user, error } = await supabase
            .from("users_app")
            .select("*")
            .eq("id", req.user.id)
            .single();

        if (error || !user) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        const validPassword = await bcrypt.compare(currentPassword, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ message: "La contrasena actual no es correcta" });
        }

        const password_hash = await bcrypt.hash(newPassword, 10);

        const { error: updateError } = await supabase
            .from("users_app")
            .update({ password_hash })
            .eq("id", req.user.id);

        if (updateError) {
            return res.status(400).json({ message: updateError.message });
        }

        res.json({ message: "Contrasena actualizada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error cambiando contrasena" });
    }
});

module.exports = router;
