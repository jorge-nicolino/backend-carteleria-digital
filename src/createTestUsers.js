const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const supabase = require("./db");
require("dotenv").config();

async function createUser({ name, email, password, role }) {
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
        .select();

    if (error) {
        console.log(`No se pudo crear ${email}:`, error.message);
        return;
    }

    console.log(`Usuario creado: ${email} / ${password} / ${role}`);
}

async function main() {
    const marketingPassword = process.env.MARKETING_INITIAL_PASSWORD || crypto.randomBytes(9).toString("base64url");
    const viewerPassword = process.env.VIEWER_INITIAL_PASSWORD || crypto.randomBytes(9).toString("base64url");

    await createUser({
        name: "Marketing Colegio",
        email: "marketing@colegio.com",
        password: marketingPassword,
        role: "marketing",
    });

    await createUser({
        name: "Usuario Observador",
        email: "viewer@colegio.com",
        password: viewerPassword,
        role: "viewer",
    });
}

main();
