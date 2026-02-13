(() => {
  const CLIENT_ID_KEY = "erwinClientId";
  const VOLUME_KEY = "erwinVolume";
  const MUTE_KEY = "erwinMuted";

  function formatTrackLabel(track) {
    if (!track) return "Waiting for session start...";
    if (track.title) return track.title;
    return track.youtube_id || track.id;
  }

  function getOrCreateClientId() {
    let clientId = localStorage.getItem(CLIENT_ID_KEY);
    if (!clientId) {
      if (window.crypto?.randomUUID) {
        clientId = window.crypto.randomUUID();
      } else {
        clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }
      localStorage.setItem(CLIENT_ID_KEY, clientId);
    }
    return clientId;
  }

  function createPlayer({ elementId, statusEl, mode }) {
    const clientId = getOrCreateClientId();
    const state = {
      audio: null,
      currentTrackId: null,
      playState: null,
      currentTrack: null,
      ws: null,
      heartbeatTimer: null,
      timeSyncTimer: null,
      syncTimer: null,
      offsetMs: 0,
      lastStateServerNow: null,
      lastStateReceivedAt: 0,
      lastError: null,
      recoverAttempts: 0,
      lastProgressAt: Date.now(),
      lastProgressTime: 0,
      waitingSince: null
    };

    function updateStatus(track, playState) {
      if (!statusEl) return;
      const label = formatTrackLabel(track);
      if (!playState?.started_at_ms || !track) {
        statusEl.textContent = "Waiting for session start...";
        return;
      }
      const pausedLabel = playState.paused ? "Paused" : "Playing";
      statusEl.textContent = `${label} (${pausedLabel})`;
    }

    function getServerNowEstimate() {
      if (Number.isFinite(state.lastStateServerNow) && state.lastStateReceivedAt > 0) {
        return state.lastStateServerNow + (Date.now() - state.lastStateReceivedAt);
      }
      return Date.now() + state.offsetMs;
    }

    function expectedTimeSeconds(track = state.currentTrack, playState = state.playState) {
      if (!playState?.started_at_ms) return 0;
      const serverNow = getServerNowEstimate();
      const reference = playState.paused && playState.paused_at_ms ? playState.paused_at_ms : serverNow;
      let expected = Math.max(0, (reference - playState.started_at_ms) / 1000);
      if (Number.isFinite(track?.duration_sec) && track.duration_sec > 0) {
        expected = Math.min(track.duration_sec, expected);
      }
      return expected;
    }

    function emit(type, payload = {}) {
      if (state.ws?.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type, clientId, ...payload }));
      }
    }

    function applyStoredVolume() {
      if (!state.audio) return;
      const volume = Number(localStorage.getItem(VOLUME_KEY));
      const muted = localStorage.getItem(MUTE_KEY) === "true";
      if (Number.isFinite(volume)) {
        state.audio.volume = Math.min(1, Math.max(0, volume));
      }
      state.audio.muted = muted;
    }

    function trackProgress() {
      if (!state.audio) return;
      const current = Number.isFinite(state.audio.currentTime) ? state.audio.currentTime : 0;
      if (current > state.lastProgressTime + 0.3) {
        state.lastProgressTime = current;
        state.lastProgressAt = Date.now();
        state.waitingSince = null;
      }
    }

    async function recoverPlayback(reason = "recover") {
      if (!state.audio || !state.playState || !state.currentTrack) return;
      state.recoverAttempts += 1;
      const target = expectedTimeSeconds();
      try {
        await state.audio.play();
        return;
      } catch {
        // Continue with hard reload.
      }
      state.audio.pause();
      if (state.currentTrack?.id) {
        state.audio.src = `/api/audio/${state.currentTrack.id}?v=${state.playState.started_at_ms || 0}`;
      }
      state.audio.load();
      const canPlayHandler = async () => {
        state.audio.removeEventListener("canplay", canPlayHandler);
        try {
          state.audio.currentTime = target;
        } catch {
          // ignore seek failure before metadata settles
        }
        if (!state.playState?.paused) {
          try {
            await state.audio.play();
          } catch (error) {
            state.lastError = {
              code: "play_failed",
              message: error?.message || "play() failed",
              at: Date.now()
            };
            emit("PLAYER_EVENT", { event: "error", details: state.lastError });
          }
        }
      };
      state.audio.addEventListener("canplay", canPlayHandler);
      emit("PLAYER_EVENT", { event: "waiting", details: { reason, attempt: state.recoverAttempts } });
    }

    async function applyPlayback(track, playState, force = false) {
      if (!state.audio) return;
      if (!track || !track.id || !playState?.started_at_ms || !track.audio_path) {
        state.audio.pause();
        state.audio.removeAttribute("src");
        state.currentTrackId = null;
        updateStatus(track, playState);
        return;
      }

      if (state.currentTrackId !== track.id) {
        state.currentTrackId = track.id;
        state.audio.src = `/api/audio/${track.id}`;
        state.audio.load();
      }

      const targetTime = expectedTimeSeconds(track, playState);
      const currentTime = Number.isFinite(state.audio.currentTime) ? state.audio.currentTime : 0;
      const drift = Math.abs(currentTime - targetTime);
      if (force || drift > 1.2) {
        try {
          state.audio.currentTime = targetTime;
        } catch {
          // ignore temporary seek errors
        }
      }

      if (playState.paused) {
        state.audio.pause();
      } else {
        try {
          await state.audio.play();
        } catch (error) {
          state.lastError = {
            code: "autoplay_blocked",
            message: error?.message || "play() failed",
            at: Date.now()
          };
          recoverPlayback("autoplay");
        }
      }
      updateStatus(track, playState);
    }

    function sendHeartbeat() {
      if (!state.audio) return;
      let bufferedEnd = null;
      if (state.audio.buffered?.length) {
        bufferedEnd = state.audio.buffered.end(state.audio.buffered.length - 1);
      }
      emit("PLAYER_HEARTBEAT", {
        trackId: state.currentTrack?.id || null,
        currentTime: Number.isFinite(state.audio.currentTime) ? state.audio.currentTime : 0,
        paused: state.audio.paused,
        readyState: state.audio.readyState,
        networkState: state.audio.networkState,
        bufferedEnd,
        lastError: state.lastError
      });
    }

    function setupWebSocket() {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
      state.ws = ws;

      ws.addEventListener("open", () => {
        emit("HELLO", { page: mode || "unknown", userAgent: navigator.userAgent });
        emit("TIME_SYNC_PING", { t0: Date.now() });
        state.timeSyncTimer = setInterval(() => emit("TIME_SYNC_PING", { t0: Date.now() }), 10000);
        state.heartbeatTimer = setInterval(sendHeartbeat, 3000);
      });

      ws.addEventListener("message", (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        if (message.type === "TIME_SYNC_PONG" && Number.isFinite(message.t0) && Number.isFinite(message.t1)) {
          const t2 = Date.now();
          const rtt = t2 - message.t0;
          const offset = message.t1 - (message.t0 + rtt / 2);
          state.offsetMs = state.offsetMs * 0.8 + offset * 0.2;
        }

        if (message.type === "STATE_UPDATE") {
          setState({
            playState: message.playState,
            currentTrack: message.currentTrack,
            serverNow: message.serverNow
          });
          return;
        }

        if (message.type === "CLIENT_ADJUST") {
          if (!state.playState) return;
          if (message.targetTrackId && state.currentTrack?.id !== message.targetTrackId) {
            fetch("/api/state")
              .then((res) => (res.ok ? res.json() : null))
              .then((payload) => payload && setState(payload))
              .catch(() => {});
            return;
          }
          if (Number.isFinite(message.targetTime) && state.audio) {
            try {
              state.audio.currentTime = Math.max(0, message.targetTime);
            } catch {
              // ignore seek errors
            }
          }
          if (message.shouldBePaused) {
            state.audio?.pause();
          } else {
            state.audio?.play().catch(() => recoverPlayback("adjust"));
          }
        }

        if (message.event === "STATE_UPDATE") {
          fetch("/api/state")
            .then((res) => (res.ok ? res.json() : null))
            .then((payload) => payload && setState(payload))
            .catch(() => {});
        }
      });

      ws.addEventListener("close", () => {
        if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
        if (state.timeSyncTimer) clearInterval(state.timeSyncTimer);
      });
    }

    function initAudioListeners() {
      if (!state.audio) return;
      ["error", "stalled", "waiting", "playing", "pause", "ended"].forEach((eventName) => {
        state.audio.addEventListener(eventName, () => {
          if (eventName === "error") {
            const err = state.audio.error;
            state.lastError = {
              code: err?.code || "media_error",
              message: "audio element error",
              at: Date.now()
            };
            recoverPlayback("error");
          }
          if (eventName === "stalled" || eventName === "waiting") {
            state.waitingSince = state.waitingSince || Date.now();
          }
          if (eventName === "playing") {
            state.recoverAttempts = 0;
            state.lastError = null;
            state.waitingSince = null;
          }
          emit("PLAYER_EVENT", { event: eventName, details: { readyState: state.audio.readyState } });
        });
      });
      state.audio.addEventListener("timeupdate", trackProgress);
    }

    async function init() {
      state.audio = document.getElementById(elementId);
      if (!state.audio) return;
      state.audio.preload = "metadata";
      applyStoredVolume();
      initAudioListeners();
      setupWebSocket();

      state.syncTimer = setInterval(() => {
        if (!state.audio || !state.playState || !state.currentTrack) return;
        applyPlayback(state.currentTrack, state.playState, false);
        if (!state.playState.paused && Date.now() - state.lastProgressAt > 7000) {
          recoverPlayback("stalled-progress");
        }
      }, 400);
    }

    function setState({ playState, currentTrack, serverNow }) {
      state.playState = playState || null;
      state.currentTrack = currentTrack || null;
      state.lastStateServerNow = Number.isFinite(serverNow) ? serverNow : null;
      state.lastStateReceivedAt = Date.now();
      if (!state.audio) return;
      applyPlayback(currentTrack, playState, true);
    }

    init();

    return {
      setState,
      play: () => state.audio?.play(),
      pause: () => state.audio?.pause(),
      mute: () => {
        if (state.audio) {
          state.audio.muted = true;
          localStorage.setItem(MUTE_KEY, "true");
        }
      },
      unmute: () => {
        if (state.audio) {
          state.audio.muted = false;
          localStorage.setItem(MUTE_KEY, "false");
        }
      },
      setVolume: (value) => {
        if (state.audio) {
          const normalized = Math.min(1, Math.max(0, value / 100));
          state.audio.volume = normalized;
          localStorage.setItem(VOLUME_KEY, String(normalized));
        }
      },
      seekTo: (seconds) => {
        if (state.audio) state.audio.currentTime = seconds;
      },
      getCurrentTime: () => (state.audio ? state.audio.currentTime || 0 : 0),
      getDuration: () => (state.audio ? state.audio.duration || 0 : 0),
      isMuted: () => Boolean(state.audio?.muted),
      getVolumePercent: () => Math.round((state.audio?.volume ?? 0.8) * 100),
      syncNow: () => {
        if (!state.playState || !state.currentTrack) return;
        applyPlayback(state.currentTrack, state.playState, true);
      }
    };
  }

  window.ErwinPlayer = { createPlayer };
})();
