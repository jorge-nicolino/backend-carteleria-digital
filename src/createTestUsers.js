const bcrypt = require("bcryptjs");
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
    await createUser({
        name: "Marketing Colegio",
        email: "marketing@colegio.com",
        password: "marketing1234",
        role: "marketing",
    });

    await createUser({
        name: "Usuario Observador",
        email: "viewer@colegio.com",
        password: "viewer1234",
        role: "viewer",
    });
}

main();