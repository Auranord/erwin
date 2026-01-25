(() => {
  function formatTrackLabel(track) {
    if (!track) return "Waiting for session start...";
    if (track.title) return track.title;
    return track.youtube_id || track.id;
  }

  function createPlayer({ elementId, statusEl, mode }) {
    const state = {
      audio: null,
      currentTrackId: null,
      playState: null
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

    function applyPlayback(track, playState) {
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
      syncPosition(track, playState, true);
      updateStatus(track, playState);
    }

    function syncPosition(track, playState, force = false) {
      if (!state.audio || !track || !playState?.started_at_ms) return;
      const referenceTime =
        playState.paused && playState.paused_at_ms ? playState.paused_at_ms : Date.now();
      const targetTime = Math.max(0, (referenceTime - playState.started_at_ms) / 1000);
      const currentTime = Number.isFinite(state.audio.currentTime) ? state.audio.currentTime : 0;
      const drift = Math.abs(currentTime - targetTime);
      if (force || drift > 2) {
        state.audio.currentTime = targetTime;
      }
      if (playState.paused) {
        state.audio.pause();
      } else {
        state.audio.play();
      }
    }

    async function init() {
      state.audio = document.getElementById(elementId);
      if (state.audio) {
        state.audio.preload = "metadata";
      }
    }

    function setState({ playState, currentTrack }) {
      state.playState = { playState, track: currentTrack };
      if (!state.audio) return;
      applyPlayback(currentTrack, playState);
    }

    init();

    return {
      setState,
      play: () => state.audio?.play(),
      pause: () => state.audio?.pause(),
      mute: () => {
        if (state.audio) state.audio.muted = true;
      },
      unmute: () => {
        if (state.audio) state.audio.muted = false;
      },
      setVolume: (value) => {
        if (state.audio) state.audio.volume = Math.min(1, Math.max(0, value / 100));
      },
      seekTo: (seconds) => {
        if (state.audio) state.audio.currentTime = seconds;
      },
      getCurrentTime: () => (state.audio ? state.audio.currentTime || 0 : 0),
      getDuration: () => (state.audio ? state.audio.duration || 0 : 0),
      syncNow: () => {
        if (!state.playState) return;
        syncPosition(state.playState.track, state.playState.playState, true);
      }
    };
  }

  window.ErwinPlayer = { createPlayer };
})();
