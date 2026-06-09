const API_URL = window.location.origin;

const params = new URLSearchParams(window.location.search);
const DEVICE_ID = params.get("deviceId");

let playlist = [];
let currentIndex = 0;
let isPlaying = false;
let playbackToken = 0;
let activeTimers = [];
let serverClockOffsetMs = 0;
let wakeLock = null;
let hasCompletedPlaylist = false;

if (!DEVICE_ID) {
    showMessage("No se indicó deviceId en la URL");
} else {
    loadPlaylist(true);
    keepPlayerActive();

    // refresca playlist cada 60 segundos
    setInterval(() => {
        loadPlaylist(false);
    }, 60000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handlePlayerVisible);
    window.addEventListener("pageshow", handlePlayerVisible);
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
        updateServerClockOffset(data.server_time);

        if (!newPlaylist.length) {
            showMessage("No hay contenidos en la playlist");
            return;
        }

        playlist = newPlaylist;

        if (resetPlayer) {
            hasCompletedPlaylist = false;
        }

        if (resetPlayer || (!isPlaying && !hasCompletedPlaylist) || (!hasCompletedPlaylist && shouldRealignPlayback())) {
            currentIndex = getSyncedPlaybackPosition().index;
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
    hasCompletedPlaylist = false;
    clearPlaybackTimers();
    playbackToken++;
    const token = playbackToken;

    const syncedPosition = getSyncedPlaybackPosition();
    currentIndex = syncedPosition.index;

    const item = playlist[currentIndex];
    const content = item.contents;
    const itemDuration = getItemDuration(item);
    const elapsedSeconds = syncedPosition.elapsedSeconds;
    const remainingSeconds = Math.max(itemDuration - elapsedSeconds, 0.25);

    const player = document.getElementById("player");
    disposePlayerMedia(player);
    player.innerHTML = "";

    if (!content) {
        nextItem(token);
        return;
    }

    // =====================
    // IMAGEN
    // =====================
    if (content.type === "image") {
        const img = document.createElement("img");
        img.src = getAssetUrl(content.file_url);

        player.appendChild(img);

        const timerId = setTimeout(() => {
            nextItem(token);
        }, remainingSeconds * 1000);
        activeTimers.push(timerId);
    }

    // =====================
    // VIDEO
    // =====================
    if (content.type === "video") {
        const video = document.createElement("video");

        video.src = getAssetUrl(content.file_url);
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";

        player.appendChild(video);

        video.onloadedmetadata = () => {
            const maxSeek = Number.isFinite(video.duration)
                ? Math.max(video.duration - 0.25, 0)
                : elapsedSeconds;
            video.currentTime = Math.min(elapsedSeconds, maxSeek);
            playVideo(video, token);
        };

        video.onended = () => {
            nextItem(token);
        };

        video.onerror = () => {
            console.error("Error reproduciendo video");
            nextItem(token);
        };

        video.load();

        // fallback si no dispara onended
        const timerId = setTimeout(() => {
            if (!video.paused) {
                video.pause();
            }

            nextItem(token);
        }, remainingSeconds * 1000);
        activeTimers.push(timerId);
    }
}

function nextItem(token) {
    if (token && token !== playbackToken) {
        return;
    }

    clearPlaybackTimers();

    currentIndex++;

    if (currentIndex >= playlist.length) {
        finishPlaylist(token);
        return;
    }

    playCurrent();
}

function finishPlaylist(token) {
    if (token && token !== playbackToken) {
        return;
    }

    isPlaying = false;
    hasCompletedPlaylist = true;
    clearPlaybackTimers();

    const player = document.getElementById("player");
    disposePlayerMedia(player);
    player.innerHTML = "";
}

function clearPlaybackTimers() {
    activeTimers.forEach((timerId) => clearTimeout(timerId));
    activeTimers = [];
}

function getAssetUrl(fileUrl) {
    if (!fileUrl) {
        return "";
    }

    const url = new URL(fileUrl, window.location.origin);

    if (url.pathname.startsWith("/uploads/")) {
        return `${window.location.origin}${url.pathname}`;
    }

    return url.href;
}

function disposePlayerMedia(player) {
    const mediaElements = player.querySelectorAll("video, audio");

    mediaElements.forEach((media) => {
        media.pause();
        media.removeAttribute("src");
        media.load();
    });
}

function playVideo(video, token) {
    if (token && token !== playbackToken) {
        return;
    }

    video.play().catch((error) => {
        if (document.hidden) {
            return;
        }

        console.error("No se pudo iniciar el video", error);
        nextItem(token);
    });
}

async function keepPlayerActive() {
    if (!("wakeLock" in navigator) || document.hidden) {
        return;
    }

    try {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => {
            wakeLock = null;
        });
    } catch (error) {
        console.warn("No se pudo mantener la pantalla activa", error);
    }
}

function handleVisibilityChange() {
    if (document.hidden) {
        return;
    }

    handlePlayerVisible();
}

function handlePlayerVisible() {
    keepPlayerActive();

    if (!playlist.length) {
        loadPlaylist(true);
        return;
    }

    if (hasCompletedPlaylist) {
        return;
    }

    currentIndex = getSyncedPlaybackPosition().index;
    playCurrent();
}

function updateServerClockOffset(serverTime) {
    const serverTimeMs = Date.parse(serverTime);

    if (Number.isFinite(serverTimeMs)) {
        serverClockOffsetMs = serverTimeMs - Date.now();
    }
}

function getSyncedNowMs() {
    return Date.now() + serverClockOffsetMs;
}

function getItemDuration(item) {
    const videoDuration = Number(item?.contents?.duration_seconds);
    const itemDuration = Number(item?.duration_seconds);
    const duration = item?.contents?.type === "video" && videoDuration > 0
        ? videoDuration
        : itemDuration;

    return Number.isFinite(duration) && duration > 0 ? duration : 10;
}

function getSyncedPlaybackPosition() {
    const totalDuration = playlist.reduce((total, item) => total + getItemDuration(item), 0);

    if (!playlist.length || totalDuration <= 0) {
        return { index: 0, elapsedSeconds: 0 };
    }

    const elapsedInCycle = (getSyncedNowMs() / 1000) % totalDuration;
    let accumulated = 0;

    for (let index = 0; index < playlist.length; index++) {
        const duration = getItemDuration(playlist[index]);

        if (elapsedInCycle < accumulated + duration) {
            return {
                index,
                elapsedSeconds: elapsedInCycle - accumulated,
            };
        }

        accumulated += duration;
    }

    return { index: 0, elapsedSeconds: 0 };
}

function shouldRealignPlayback() {
    const syncedPosition = getSyncedPlaybackPosition();

    if (syncedPosition.index !== currentIndex) {
        return true;
    }

    const activeVideo = document.querySelector("#player video");

    if (activeVideo && Math.abs(activeVideo.currentTime - syncedPosition.elapsedSeconds) > 2) {
        return true;
    }

    return false;
}

function showMessage(message) {
    const player = document.getElementById("player");

    isPlaying = false;
    clearPlaybackTimers();
    playbackToken++;

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
