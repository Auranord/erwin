      const trackEl = document.getElementById("stream-track");
      const player = window.ErwinPlayer.createPlayer({
        elementId: "player",
        statusEl: trackEl,
        mode: "stream"
      });
      const progressEl = document.getElementById("playback-progress");
      const timeEl = document.getElementById("playback-time");
      const volumeEl = document.getElementById("volume-control");
      const muteToggle = document.getElementById("mute-toggle");
      let isMuted = false;
      let isPaused = true;
      let currentTrackId = null;
      let currentUser = null;

      const STREAM_ICON_FALLBACKS = {
        play: "⯈",
        pause: "⏸",
        restart: "↺",
        skip: "⚔",
        mute: "◌",
        unmute: "◍"
      };
      const streamAvailableIcons = new Set();

      async function loadStreamIcons() {
        await Promise.all(
          Object.keys(STREAM_ICON_FALLBACKS).map(async (name) => {
            try {
              const response = await fetch(`/assets/icons/${name}.png`, { method: "HEAD" });
              if (response.ok) streamAvailableIcons.add(name);
            } catch {
              // ignore missing icon file
            }
          })
        );
      }

      function streamIcon(name) {
        if (streamAvailableIcons.has(name)) {
          return `<img src="/assets/icons/${name}.png" class="button-icon" alt="" aria-hidden="true" />`;
        }
        return `<span class="button-icon-fallback" aria-hidden="true">${STREAM_ICON_FALLBACKS[name] || "•"}</span>`;
      }

      function canControlPlayback() {
        return Boolean(currentUser?.role && currentUser.role !== "guest");
      }

      function canUseScoreFeedback() {
        return Boolean(currentUser?.role && currentUser.role !== "guest");
      }

      function applyRolePermissions() {
        const disablePlaybackControls = !canControlPlayback();
        document.getElementById("play-toggle").disabled = disablePlaybackControls;
        document.getElementById("restart-track").disabled = disablePlaybackControls;
        document.getElementById("skip-track").disabled = disablePlaybackControls;
        document.getElementById("playback-progress").disabled = disablePlaybackControls;
        const disableScoreControls = !canUseScoreFeedback();
        document.getElementById("score-up").disabled = disableScoreControls;
        document.getElementById("score-down").disabled = disableScoreControls;
      }

      async function fetchCurrentUser() {
        const response = await fetch("/api/me");
        if (!response.ok) return;
        currentUser = await response.json();
        applyRolePermissions();
      }


      function formatTime(seconds) {
        if (!Number.isFinite(seconds)) return "0:00";
        const minutes = Math.floor(seconds / 60);
        const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
        return `${minutes}:${remaining}`;
      }

      function updateProgress() {
        const duration = player.getDuration();
        const current = player.getCurrentTime();
        if (duration > 0) {
          const percent = Math.min(100, (current / duration) * 100);
          progressEl.value = String(percent);
          timeEl.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
        } else {
          progressEl.value = "0";
          timeEl.textContent = "0:00 / 0:00";
        }
      }

      async function refresh() {
        const response = await fetch("/api/state");
        if (!response.ok) return;
        const { playState, currentTrack } = await response.json();
        player.setState({ playState, currentTrack });
        currentTrackId = currentTrack?.id || null;
        isPaused = playState?.paused ?? true;
        const playToggle = document.getElementById("play-toggle");
        playToggle.innerHTML = isPaused ? streamIcon("play") : streamIcon("pause");
        playToggle.title = isPaused ? "Play" : "Pause";
      }

      Promise.all([loadStreamIcons(), fetchCurrentUser()]).then(() => {
        muteToggle.innerHTML = streamIcon("mute");
        document.getElementById("restart-track").innerHTML = streamIcon("restart");
        document.getElementById("skip-track").innerHTML = streamIcon("skip");
        refresh();
      });
      updateProgress();
      setInterval(updateProgress, 1000);
      setInterval(refresh, 5000);

      const storedVolume = player.getVolumePercent();
      volumeEl.value = String(storedVolume);
      if (player.isMuted()) {
        isMuted = true;
        muteToggle.innerHTML = streamIcon("unmute");
        muteToggle.title = "Unmute";
      }

      document.getElementById("play-toggle").addEventListener("click", () => {
        if (!canControlPlayback()) return;
        if (isPaused) {
          fetch("/api/session/resume", { method: "POST", headers: { "Content-Type": "application/json" } }).then(
            refresh
          );
        } else {
          fetch("/api/session/pause", { method: "POST", headers: { "Content-Type": "application/json" } }).then(
            refresh
          );
        }
      });
      document.getElementById("restart-track").addEventListener("click", () => {
        if (!canControlPlayback()) return;
        fetch("/api/session/seek", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positionSeconds: 0 })
        }).then(refresh);
      });
      document.getElementById("skip-track").addEventListener("click", async () => {
        if (!canControlPlayback()) return;
        await fetch("/api/queue/skip", { method: "POST", headers: { "Content-Type": "application/json" } });
        refresh();
      });
      muteToggle.addEventListener("click", () => {
        isMuted = !isMuted;
        if (isMuted) {
          player.mute();
          muteToggle.innerHTML = streamIcon("unmute");
          muteToggle.title = "Unmute";
        } else {
          player.unmute();
          muteToggle.innerHTML = streamIcon("mute");
          muteToggle.title = "Mute";
        }
      });
      volumeEl.addEventListener("input", () => {
        const value = Number(volumeEl.value);
        player.setVolume(value);
      });
      async function sendScoreFeedback(signal) {
        if (!canUseScoreFeedback()) return;
        if (!currentTrackId) return;
        const response = await fetch(`/api/tracks/${currentTrackId}/score-feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signal })
        });
        if (response.status === 409) {
          alert("You already rated this song today.");
          return;
        }
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          alert(payload.error || "Unable to send feedback");
          return;
        }
        refresh();
      }
      document.getElementById("score-up").addEventListener("click", () => sendScoreFeedback(1));
      document.getElementById("score-down").addEventListener("click", () => sendScoreFeedback(-1));
      progressEl.addEventListener("change", () => {
        if (!canControlPlayback()) return;
        const duration = player.getDuration();
        if (!duration) return;
        const target = (Number(progressEl.value) / 100) * duration;
        fetch("/api/session/seek", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positionSeconds: target })
        }).then(refresh);
      });
