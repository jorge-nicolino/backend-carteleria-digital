const bcrypt = require("bcryptjs");
const supabase = require("./db");
require("dotenv").config();

async function createAdmin() {
    const password = "admin1234";
    const password_hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
        .from("users_app")
        .insert([
            {
                name: "Administrador",
                email: "admin@colegio.com",
                password_hash,
                role: "admin",
            },
        ])
        .select();

    if (error) {
        console.error("Error creando admin:", error.message);
        return;
    }

    console.log("Usuario admin creado:");
    console.log(data);
    console.log("Email: admin@colegio.com");
    console.log("Password: admin1234");
}

createAdmin();