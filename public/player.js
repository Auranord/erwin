(() => {
  let apiReady;

  function loadYouTubeApi() {
    if (apiReady) return apiReady;
    apiReady = new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        resolve(window.YT);
        return;
      }
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      window.onYouTubeIframeAPIReady = () => resolve(window.YT);
      document.head.appendChild(tag);
    });
    return apiReady;
  }

  function formatTrackLabel(track) {
    if (!track) return "Waiting for session start...";
    if (track.title) return track.title;
    return track.youtube_id || track.id;
  }

  function createPlayer({ elementId, statusEl, mode }) {
    const state = {
      player: null,
      currentVideoId: null,
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
      if (!state.player) return;
      if (!track || !track.youtube_id || !playState?.started_at_ms) {
        state.player.stopVideo();
        state.currentVideoId = null;
        updateStatus(track, playState);
        return;
      }
      if (state.currentVideoId !== track.youtube_id) {
        state.currentVideoId = track.youtube_id;
        state.player.loadVideoById(track.youtube_id, 0);
      }
      syncPosition(track, playState, true);
      updateStatus(track, playState);
    }

    function syncPosition(track, playState, force = false) {
      if (!state.player || !track || !playState?.started_at_ms) return;
      const targetTime = Math.max(0, (Date.now() - playState.started_at_ms) / 1000);
      const currentTime = state.player.getCurrentTime ? state.player.getCurrentTime() : 0;
      const drift = Math.abs(currentTime - targetTime);
      if (force || drift > 2) {
        state.player.seekTo(targetTime, true);
      }
      if (playState.paused) {
        state.player.pauseVideo();
      } else {
        state.player.playVideo();
      }
    }

    async function init() {
      await loadYouTubeApi();
      state.player = new window.YT.Player(elementId, {
        height: "0",
        width: "0",
        videoId: "",
        playerVars: {
          autoplay: 1,
          controls: 0,
          rel: 0,
          enablejsapi: 1,
          modestbranding: 1
        },
        events: {
          onReady: () => {
            if (state.playState) {
              applyPlayback(state.playState.track, state.playState.playState);
            }
          }
        }
      });
    }

    function setState({ playState, currentTrack }) {
      state.playState = { playState, track: currentTrack };
      if (!state.player) return;
      applyPlayback(currentTrack, playState);
    }

    function startSyncLoop() {
      if (mode !== "listen") return;
      setInterval(() => {
        if (!state.playState) return;
        syncPosition(state.playState.track, state.playState.playState, false);
      }, 2000);
    }

    init();
    startSyncLoop();

    return { setState };
  }

  window.ErwinPlayer = { createPlayer };
})();
