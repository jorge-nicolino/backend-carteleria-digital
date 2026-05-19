const API_URL = window.location.origin;

const params = new URLSearchParams(window.location.search);
const DEVICE_ID = params.get("deviceId");

let playlist = [];
let currentIndex = 0;
let isPlaying = false;

if (!DEVICE_ID) {
    showMessage("No se indicó deviceId en la URL");
} else {
    loadPlaylist(true);

    // refresca playlist cada 60 segundos
    setInterval(() => {
        loadPlaylist(false);
    }, 60000);
}

async function loadPlaylist(resetPlayer = false) {
    try {
        const res = await fetch(`${API_URL}/api/player/${DEVICE_ID}`);
        const data = await res.json();

        if (!res.ok) {
            showMessage(data.message || "Error cargando playlist");
            return;
        }

        const newPlaylist = data.items || [];

        if (!newPlaylist.length) {
            showMessage("No hay contenidos en la playlist");
            return;
        }

        playlist = newPlaylist;

        if (resetPlayer && !isPlaying) {
            currentIndex = 0;
            playCurrent();
        }
    } catch (err) {
        console.error("Error cargando playlist", err);
        showMessage("No se pudo conectar con el servidor");
    }
}

function playCurrent() {
    if (!playlist.length) return;

    isPlaying = true;

    const item = playlist[currentIndex];
    const content = item.contents;

    const player = document.getElementById("player");
    player.innerHTML = "";

    if (!content) {
        nextItem();
        return;
    }

    // =====================
    // IMAGEN
    // =====================
    if (content.type === "image") {
        const img = document.createElement("img");
        img.src = content.file_url;

        player.appendChild(img);

        const duration =
            item.duration_seconds ||
            10;

        setTimeout(() => {
            nextItem();
        }, duration * 1000);
    }

    // =====================
    // VIDEO
    // =====================
    if (content.type === "video") {
        const video = document.createElement("video");

        video.src = content.file_url;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;

        player.appendChild(video);

        video.onended = () => {
            nextItem();
        };

        video.onerror = () => {
            console.error("Error reproduciendo video");
            nextItem();
        };

        // fallback si no dispara onended
        const fallbackDuration = item.duration_seconds;

        if (fallbackDuration) {
            setTimeout(() => {
                if (!video.paused) {
                    video.pause();
                }

                nextItem();
            }, fallbackDuration * 1000);
        }
    }
}

function nextItem() {
    currentIndex++;

    if (currentIndex >= playlist.length) {
        currentIndex = 0;
    }

    playCurrent();
}

function showMessage(message) {
    const player = document.getElementById("player");

    player.innerHTML = `
    <div style="
        color: white;
        font-family: Arial, sans-serif;
        font-size: 32px;
        text-align: center;
        padding: 40px;
    ">
        ${message}
    </div>
    `;
}
