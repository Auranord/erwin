const nowPlaying = document.getElementById("now-playing");
      const nowPlayingText = document.getElementById("now-playing-text");
      const nowPlayingIndicator = document.getElementById("now-playing-indicator");
      const queueEl = document.getElementById("queue");
      const poolEl = document.getElementById("pool");
      const playlistsEl = document.getElementById("playlists");
      const tracksEl = document.getElementById("tracks");
      const downloadQueueEl = document.getElementById("download-queue");
      const libraryTracksEl = document.getElementById("library-tracks");
      const trackPlaylist = document.getElementById("track-playlist");
      const playlistForm = document.getElementById("playlist-form");
      const trackForm = document.getElementById("track-form");
      const trackFilter = document.getElementById("track-filter");
      const trackCount = document.getElementById("track-count");
      const renameModal = document.getElementById("rename-modal");
      const renameInput = document.getElementById("rename-input");
      const renameSave = document.getElementById("rename-save");
      const renameCancel = document.getElementById("rename-cancel");
      const voteStatus = document.getElementById("vote-status");
      const voteWindow = document.getElementById("vote-window");
      const voteOptionsEl = document.getElementById("vote-options");
      const startVoteButton = document.getElementById("start-vote");
      const chatFeed = document.getElementById("chat-feed");
      const settingsForm = document.getElementById("settings-form");
      const settingsStatus = document.getElementById("settings-status");
      const settingsVoteOptions = document.getElementById("settings-vote-options");
      const settingsVoteDuration = document.getElementById("settings-vote-duration");
      const settingsVoteLead = document.getElementById("settings-vote-lead");
      const autoVoteToggle = document.getElementById("auto-vote-toggle");
      const settingsTwitchWelcome = document.getElementById("settings-twitch-welcome");
      const settingsTwitchVoteStart = document.getElementById("settings-twitch-vote-start");
      const settingsTwitchVoteOption = document.getElementById("settings-twitch-vote-option");
      const settingsTwitchVoteEnd = document.getElementById("settings-twitch-vote-end");
      const settingsTwitchNowPlaying = document.getElementById("settings-twitch-now-playing");
      const settingsTwitchNoActive = document.getElementById("settings-twitch-no-active");
      const settingsTwitchVoteClosed = document.getElementById("settings-twitch-vote-closed");
      const settingsTwitchInvalidVote = document.getElementById("settings-twitch-invalid-vote");
      const settingsTwitchSkip = document.getElementById("settings-twitch-skip");
      const settingsTwitchPause = document.getElementById("settings-twitch-pause");
      const settingsTwitchResume = document.getElementById("settings-twitch-resume");
      const themeToggle = document.getElementById("theme-toggle");
      const usersStatus = document.getElementById("users-status");
      const usersList = document.getElementById("users-list");
      const usersCard = document.getElementById("users-card");
      const libraryManagementCard = document.getElementById("library-management-card");
      const connectChannelButton = document.getElementById("connect-channel");
      const channelAuthStatus = document.getElementById("channel-auth-status");
      const currentUserBadge = document.getElementById("current-user");
      const customCommandForm = document.getElementById("custom-command-form");
      const customCommandName = document.getElementById("custom-command-name");
      const customCommandAliases = document.getElementById("custom-command-aliases");
      const customCommandResponse = document.getElementById("custom-command-response");
      const customCommandEnabled = document.getElementById("custom-command-enabled");
      const customCommandSubmit = document.getElementById("custom-command-submit");
      const customCommandCancel = document.getElementById("custom-command-cancel");
      const customCommandsList = document.getElementById("custom-commands-list");
      const customCommandStatus = document.getElementById("custom-command-status");
      const copyOverlayEndpointButton = document.getElementById("copy-overlay-endpoint");
      const openOverlayTestButton = document.getElementById("open-overlay-test");
      const overlayEndpointInput = document.getElementById("overlay-endpoint");
      const toastRegion = document.getElementById("toast-region");
      const twitchLiveStatus = document.getElementById("twitch-live-status");
      const overlayHypeForm = document.getElementById("overlay-hype-form");
      const overlayHypeTestButton = document.getElementById("overlay-hype-test");
      const overlayHypeStatus = document.getElementById("overlay-hype-status");
      const hypeEmotesInput = document.getElementById("hype-emotes");
      const hypeThresholdPercentInput = document.getElementById("hype-threshold-percent");
      const hypeDurationSecondsInput = document.getElementById("hype-duration-seconds");
      const hypeExtensionRatioInput = document.getElementById("hype-extension-ratio");
      const hypeUserCooldownSecondsInput = document.getElementById("hype-user-cooldown-seconds");
      let currentUser = null;
      const themeUserKeyBase = "erwin_last_user";
      let playlistsCache = [];
      let libraryTracksCache = [];
      let queueOrder = [];
      const SELECTED_PLAYLIST_STORAGE_KEY = "erwin_selected_playlist";
      let selectedPlaylistId = localStorage.getItem(SELECTED_PLAYLIST_STORAGE_KEY) || null;
      let renameTrackId = null;
      let activeVote = null;
      let voteTimer = null;
      let poolTrackIds = new Set();
      let draggedTrackId = null;
      let draggedQueueId = null;
      let customCommandsCache = [];
      let editingCustomCommandId = null;
      const chatMessages = [];
      const LIBRARY_COLUMNS = [
        { key: "name", label: "Name", sortable: true, defaultVisible: true },
        { key: "youtube", label: "YouTube", sortable: true, defaultVisible: true },
        { key: "duration", label: "Duration", sortable: true, defaultVisible: true },
        { key: "volume", label: "Volume", sortable: true, defaultVisible: true },
        { key: "score", label: "Score", sortable: true, defaultVisible: true },
        { key: "intro", label: "Intro", sortable: true, defaultVisible: true },
        { key: "outro", label: "Outro", sortable: true, defaultVisible: true },
        { key: "status", label: "Status", sortable: true, defaultVisible: true },
        { key: "addedBy", label: "Added By", sortable: true, defaultVisible: true },
        { key: "addedAt", label: "Added", sortable: true, defaultVisible: true }
      ];
      const DEFAULT_LIBRARY_COLUMNS = LIBRARY_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key);
      const LIBRARY_COLUMNS_STORAGE_KEY = "erwin_library_visible_columns";
      let visibleLibraryColumns = new Set(DEFAULT_LIBRARY_COLUMNS);
      let librarySort = { key: "name", direction: "asc" };
      let playlistPickTrackId = null;
      let playlistPickInitialSelection = new Set();
      const playlistImportFile = document.getElementById("playlist-import-file");
      const importPlaylistJsonButton = document.getElementById("import-playlist-json");
      const exportLibraryJsonButton = document.getElementById("export-library-json");
      const importLibraryJsonButton = document.getElementById("import-library-json");
      const libraryImportFile = document.getElementById("library-import-file");
      const libraryImportStatus = document.getElementById("library-import-status");
      const librarySearch = document.getElementById("library-search");
      const libraryTagsInclude = document.getElementById("library-tags-include");
      const libraryTagsExclude = document.getElementById("library-tags-exclude");
      const libraryAddedBySearch = document.getElementById("library-added-by-search");
      const libraryColumnsButton = document.getElementById("library-columns-button");
      const libraryColumnsModal = document.getElementById("library-columns-modal");
      const libraryColumnsOptions = document.getElementById("library-columns-options");
      const libraryColumnsSave = document.getElementById("library-columns-save");
      const libraryColumnsCancel = document.getElementById("library-columns-cancel");
      const playlistPickModal = document.getElementById("playlist-pick-modal");
      const playlistPickOptions = document.getElementById("playlist-pick-options");
      const playlistPickSave = document.getElementById("playlist-pick-save");
      const playlistPickCancel = document.getElementById("playlist-pick-cancel");
      const ICON_FALLBACKS = {
        play: "⯈",
        pause: "⏸",
        skip: "⚔",
        restart: "↺",
        mute: "◌",
        unmute: "◍",
        enqueue: "⚔",
        poolAdd: "✚",
        poolRemove: "✖",
        rename: "✒",
        disable: "⛔",
        enable: "✹",
        delete: "☠",
        download: "⤓",
        tags: "🏷",
        audio: "🎚",
        trim: "✂",
        score: "◉",
        playlistAdd: "☑"
      };
      const availableIcons = new Set();

      function getThemeStorageKey() {
        const storedUser = localStorage.getItem(themeUserKeyBase) || "guest";
        return `erwin_theme_${storedUser}`;
      }

      function applyTheme(theme) {
        const nextTheme = theme === "darkwood" ? "darkwood" : "guild";
        document.body.dataset.theme = nextTheme;
        themeToggle.setAttribute("aria-pressed", String(nextTheme === "darkwood"));
        themeToggle.textContent = nextTheme === "darkwood" ? "🌘 Guild Light" : "🌒 Dark Wood";
        themeToggle.title = nextTheme === "darkwood" ? "Return to Guild Light" : "Switch to Dark Wood mode";
      }

      const savedTheme = localStorage.getItem(getThemeStorageKey()) || "guild";
      applyTheme(savedTheme);
      restoreLibraryColumnPrefs();

      themeToggle.addEventListener("click", () => {
        const nextTheme = document.body.dataset.theme === "darkwood" ? "guild" : "darkwood";
        applyTheme(nextTheme);
        localStorage.setItem(getThemeStorageKey(), nextTheme);
      });
      const HYPE_DEFAULTS = {
        emotes: "PogChamp,Kappa,HYPERS",
        thresholdPercent: 20,
        durationSeconds: 12,
        extensionRatio: 0.35,
        userCooldownSeconds: 8
      };

      const DEFAULT_TWITCH_MESSAGES = {
        vote_start: "Vote time! Choose the next track with {command}vote <number>.",
        vote_option: "{number}. {title}{channel}",
        vote_end: "Vote ended! Winner: {winner}",
        now_playing: "Now playing: {track}",
        no_active: "No active vote right now.",
        vote_closed: "Voting is closed.",
        invalid_vote: "Invalid vote. Choose 1-{max}.",
        skip: "Skipped to the next track.",
        pause: "Playback paused.",
        resume: "Playback resumed."
      };

      function showToast(message, type = "info") {
        if (!toastRegion) return;
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastRegion.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add("visible"));
        const closeToast = () => {
          toast.classList.remove("visible");
          window.setTimeout(() => toast.remove(), 180);
        };
        window.setTimeout(closeToast, 2400);
      }

      const overlayEndpoint = `${window.location.origin}/overlay/canvas`;
      if (overlayEndpointInput) {
        overlayEndpointInput.value = overlayEndpoint;
      }

      document.querySelectorAll(".tab-link").forEach((link) => {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          const target = link.dataset.tab;
          document.querySelectorAll(".tab-link").forEach((tab) => {
            tab.classList.toggle("active", tab.dataset.tab === target);
          });
          document.querySelectorAll(".tab-panel").forEach((panel) => {
            panel.classList.toggle("active", panel.dataset.tabPanel === target);
          });
        });
      });

      async function loadAvailableIcons() {
        const iconNames = Object.keys(ICON_FALLBACKS);
        await Promise.all(
          iconNames.map(async (name) => {
            try {
              const response = await fetch(`/assets/icons/${name}.png`, { method: "HEAD" });
              if (response.ok) availableIcons.add(name);
            } catch {
              // Ignore missing icon files.
            }
          })
        );
      }

      function iconHtml(name) {
        const fallback = ICON_FALLBACKS[name] || "•";
        if (availableIcons.has(name)) {
          return `<img src="/assets/icons/${name}.png" class="button-icon" alt="" aria-hidden="true" />`;
        }
        return `<span class="button-icon-fallback" aria-hidden="true">${fallback}</span>`;
      }


      function restoreLibraryColumnPrefs() {
        try {
          const raw = localStorage.getItem(LIBRARY_COLUMNS_STORAGE_KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) return;
          const allowed = new Set(LIBRARY_COLUMNS.map((column) => column.key));
          const keys = parsed.filter((key) => allowed.has(key));
          if (keys.length) {
            visibleLibraryColumns = new Set(keys);
          }
        } catch {
          // Ignore invalid local preferences.
        }
      }

      function renderTracks() {
        if (!selectedPlaylistId) {
          tracksEl.innerHTML = '<div class="list-item">Select a playlist to view tracks.</div>';
          trackCount.textContent = "0 tracks";
          return;
        }
        const playlist = playlistsCache.find((item) => item.id === selectedPlaylistId);
        if (!playlist || playlist.tracks.length === 0) {
          tracksEl.innerHTML = '<div class="list-item">No tracks in this playlist yet.</div>';
          trackCount.textContent = "0 tracks";
          return;
        }
        const query = trackFilter.value.trim().toLowerCase();
        const filtered = playlist.tracks.filter((track) => {
          if (!query) return true;
          return (
            track.title?.toLowerCase().includes(query) ||
            track.youtube_id?.toLowerCase().includes(query) ||
            track.url?.toLowerCase().includes(query)
          );
        });
        trackCount.textContent = `${filtered.length} / ${playlist.tracks.length} tracks`;
        tracksEl.innerHTML = filtered
          .map((track, index) => {
            const label = track.title || "Untitled track";
            const disabled = Boolean(track.disabled);
            const disabledLabel = disabled ? '<span class="badge">Disabled</span>' : "";
            const toggleLabel = disabled ? "Enable track" : "Disable track";
            const inPool = poolTrackIds.has(track.id);
            const poolAction = inPool ? "pool-remove" : "pool-add";
            const poolLabel = inPool ? "Remove from pool" : "Add to pool";
            const poolIcon = iconHtml(inPool ? "poolRemove" : "poolAdd");
            return `<div class="list-item draggable-item ${disabled ? "disabled" : ""}" draggable="true" data-track-id="${track.id}" data-track-title="${track.title || ""}" data-track-disabled="${disabled}">
                <div style="flex: 1;">
                  <div style="display: flex; gap: 8px; align-items: center;"><span class="drag-handle" aria-hidden="true">⋮⋮</span>${label} ${disabledLabel}</div>
                </div>
                <div class="actions">
                  <button class="secondary icon-only" data-action="enqueue" title="Add to queue end" aria-label="Add to queue end">${iconHtml("enqueue")}</button>
                  <button class="secondary icon-only" data-action="${poolAction}" title="${poolLabel}" aria-label="${poolLabel}">${poolIcon}</button>
                  <button class="secondary icon-only" data-action="toggle-disabled" title="${toggleLabel}" aria-label="${toggleLabel}">${iconHtml(disabled ? "enable" : "disable")}</button>
                  <button class="ghost icon-only" data-action="remove" title="Remove track" aria-label="Remove track">${iconHtml("delete")}</button>
                </div>
              </div>`;
          })
          .join("");
      }

      function formatRemainingTime(endsAt) {
        if (!endsAt) return "--";
        const remainingMs = new Date(endsAt).getTime() - Date.now();
        if (remainingMs <= 0) return "0s";
        const seconds = Math.ceil(remainingMs / 1000);
        return `${seconds}s`;
      }

      function renderVoteOptions() {
        if (!activeVote || !activeVote.options?.length) {
          voteOptionsEl.innerHTML = '<div class="list-item">No active vote.</div>';
          voteStatus.textContent = "Idle";
          voteWindow.textContent = "--";
          return;
        }
        const counts = activeVote.counts || {};
        voteStatus.textContent = activeVote.status || "Active";
        voteWindow.textContent =
          activeVote.status === "Ended"
            ? "Completed"
            : formatRemainingTime(activeVote.endsAt);
        const winnerMarkup = activeVote.winner
          ? `<div class="list-item"><span>Winner</span><span class="badge">${activeVote.winner.title || activeVote.winner.trackId}</span></div>`
          : "";
        voteOptionsEl.innerHTML = activeVote.options
          .map((option, index) => {
            const count = counts[index + 1] || 0;
            const title = option.title || option.trackId;
            return `<div class="list-item">
                <span>${index + 1}. ${title}</span>
                <span class="badge">${count} votes</span>
              </div>`;
          })
          .join("");
        if (winnerMarkup) {
          voteOptionsEl.innerHTML = `${winnerMarkup}${voteOptionsEl.innerHTML}`;
        }
      }

      function startVoteTimer() {
        if (voteTimer) {
          clearInterval(voteTimer);
        }
        voteTimer = setInterval(() => {
          if (!activeVote) {
            clearInterval(voteTimer);
            voteTimer = null;
            return;
          }
          renderVoteOptions();
        }, 1000);
      }

      function setActiveVote(payload) {
        if (!payload) {
          activeVote = null;
          renderVoteOptions();
          return;
        }
        activeVote = {
          roundId: payload.roundId,
          startedAt: payload.startedAt,
          endsAt: payload.endsAt,
          options: payload.options || [],
          counts: payload.counts || {},
          status: payload.status || "Active",
          winner: payload.winner || null
        };
        renderVoteOptions();
        startVoteTimer();
      }

      function appendChatMessage(entry) {
        if (!entry) return;
        const normalized = {
          role: entry.role || "viewer",
          user: entry.user || "Unknown",
          ...entry
        };
        chatMessages.push(normalized);
        if (chatMessages.length > 200) {
          chatMessages.shift();
        }
        chatFeed.innerHTML = chatMessages
          .slice(-100)
          .map((message) => {
            const badgeLabel = message.isSystem
              ? "System"
              : message.role === "mod"
                ? "Mod"
                : "Viewer";
            const commandFlag = message.isCommand ? '<span class="badge">Command</span>' : "";
            return `<div class="list-item">
                <span class="badge">${badgeLabel}</span>
                <span><strong>${message.user}</strong>: ${message.message}</span>
                ${commandFlag}
              </div>`;
          })
          .join("");
      }

      function renderUsers(users) {
        if (!users || users.length === 0) {
          usersList.innerHTML = '<div class="list-item">No users found.</div>';
          return;
        }
        usersList.innerHTML = users
          .map((user) => {
            const adminBadge = `<span class="badge">${user.role || "viewer"}</span>`;
            const adminLocked = `<button class="ghost" data-action="user-delete">Delete</button>`;
            return `
              <div class="list-item" data-user-id="${user.id}" data-username="${user.username}" data-role="${user.role || "viewer"}">
                <span>${user.username}</span>
                <div class="actions">
                  ${adminBadge}
                  ${adminLocked}
                </div>
              </div>`;
          })
          .join("");
      }

      function handleUnauthorizedResponse(response) {
        if (response.status === 401) {
          window.location.href = "/login";
          return true;
        }
        return false;
      }

      async function fetchMe() {
        const response = await fetch("/api/me");
        if (handleUnauthorizedResponse(response)) return null;
        if (!response.ok) return null;
        currentUser = await response.json();
        localStorage.setItem(themeUserKeyBase, currentUser.username || "guest");
        currentUserBadge.textContent = `${currentUser.username || "guest"} • ${currentUser.role || "viewer"}`;
        if (!currentUser.isAdmin) {
          usersCard.classList.add("hidden");
          if (libraryManagementCard) libraryManagementCard.classList.add("hidden");
        } else {
          usersCard.classList.remove("hidden");
          if (libraryManagementCard) libraryManagementCard.classList.remove("hidden");
        }
        return currentUser;
      }

      async function fetchUsers() {
        if (!currentUser?.isAdmin) {
          usersStatus.textContent = "Not permitted.";
          usersList.classList.add("hidden");
          connectChannelButton.classList.add("hidden");
          return;
        }
        usersStatus.textContent = "";
        usersList.classList.remove("hidden");
        connectChannelButton.classList.remove("hidden");
        const response = await fetch("/api/users");
        if (!response.ok) {
          usersStatus.textContent = "Failed to load users.";
          return;
        }
        const users = await response.json();
        renderUsers(users);
        fetchChannelAuthStatus();
      }

      usersList.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action='user-delete']");
        if (!button) return;
        const row = button.closest("[data-user-id]");
        if (!row) return;
        const userId = row.dataset.userId;
        const username = row.dataset.username || "user";
        if (!window.confirm(`Delete user ${username}?`)) {
          return;
        }
        const response = await fetch(`/api/users/${userId}`, { method: "DELETE" });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          usersStatus.textContent = payload.error || "Failed to delete user.";
          return;
        }
        usersStatus.textContent = "User deleted.";
        fetchUsers();
      });

      async function fetchChannelAuthStatus() {
        if (!currentUser?.isAdmin) {
          channelAuthStatus.textContent = "Channel auth status is only visible to admins.";
          return;
        }
        const response = await fetch("/api/channel-auth/status");
        if (!response.ok) {
          channelAuthStatus.textContent = "Channel auth: unavailable";
          return;
        }
        const status = await response.json();
        if (!status.connected) {
          channelAuthStatus.textContent = "Channel auth: not connected";
          return;
        }
        const label = status.displayName || status.login || "connected";
        channelAuthStatus.textContent = `Channel auth: connected as ${label}`;
      }

      async function fetchState() {
        const response = await fetch("/api/state");
        if (handleUnauthorizedResponse(response)) return;
        if (!response.ok) return;
        const { playState, queue, currentTrack } = await response.json();
        if (playState?.current_track_id && currentTrack) {
          const title = currentTrack.title || "Untitled track";
          nowPlayingText.textContent = playState.paused
            ? `Paused: ${title}`
            : `Now Playing: ${title}`;
          nowPlayingIndicator.classList.toggle("active", !playState.paused);
        } else if (playState?.paused) {
          nowPlayingText.textContent = "Playback paused.";
          nowPlayingIndicator.classList.remove("active");
        } else {
          nowPlayingText.textContent = "Nothing is playing.";
          nowPlayingIndicator.classList.remove("active");
        }
        queueOrder = (queue || []).map((item) => item.id);
        if (!queue || queue.length === 0) {
          queueEl.innerHTML = '<div class="list-item">Queue is empty.</div>';
        } else {
          queueEl.innerHTML = queue
            .map(
              (item) =>
                `<div class="list-item draggable-item" draggable="true" data-queue-id="${item.id}">
                  <div style="display:flex;align-items:center;gap:8px;flex:1;">
                    <span class="drag-handle" aria-hidden="true">⋮⋮</span>
                    <span>${item.title || item.track_id}</span>
                  </div>
                  <div class="actions">
                    <span class="badge">${item.source}</span>${item.added_by_username ? `<span class="badge">${item.added_by_username}</span>` : ""}
                    <button class="ghost icon-only" data-action="queue-remove" title="Remove from queue" aria-label="Remove from queue">${iconHtml("delete")}</button>
                  </div>
                </div>`
            )
            .join("");
        }
      }

      async function moveTrackToTarget(sourceTrackId, targetTrackId) {
        if (!selectedPlaylistId || !sourceTrackId || !targetTrackId || sourceTrackId === targetTrackId) return;
        const playlist = playlistsCache.find((item) => item.id === selectedPlaylistId);
        if (!playlist) return;
        const sourceIndex = playlist.tracks.findIndex((track) => track.id === sourceTrackId);
        const targetIndex = playlist.tracks.findIndex((track) => track.id === targetTrackId);
        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
        const direction = sourceIndex < targetIndex ? "down" : "up";
        const steps = Math.abs(targetIndex - sourceIndex);
        for (let i = 0; i < steps; i += 1) {
          await fetch(`/api/playlists/${selectedPlaylistId}/tracks/${sourceTrackId}/move`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ direction })
          });
        }
      }

      async function moveQueueToTarget(sourceQueueId, targetQueueId) {
        if (!sourceQueueId || !targetQueueId || sourceQueueId === targetQueueId) return;
        const sourceIndex = queueOrder.indexOf(sourceQueueId);
        const targetIndex = queueOrder.indexOf(targetQueueId);
        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
        const direction = sourceIndex < targetIndex ? "down" : "up";
        const steps = Math.abs(targetIndex - sourceIndex);
        for (let i = 0; i < steps; i += 1) {
          await fetch(`/api/queue/${sourceQueueId}/move`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ direction })
          });
        }
      }

      async function fetchPool() {
        const response = await fetch("/api/pool");
        if (handleUnauthorizedResponse(response)) return;
        if (!response.ok) return;
        const pool = await response.json();
        poolTrackIds = new Set(pool.map((item) => item.track_id));
        if (!pool.length) {
          poolEl.innerHTML = '<div class="list-item">Pool is empty.</div>';
          renderTracks();
          return;
        }
        poolEl.innerHTML = pool
          .map(
            (item) =>
              `<div class="list-item" data-track-id="${item.track_id}">
                <span>${item.title || item.track_id}</span>
                <div class="actions">
                  <button class="secondary icon-only" data-action="pool-enqueue" title="Enqueue track" aria-label="Enqueue track">${iconHtml("enqueue")}</button>
                  <button class="ghost icon-only" data-action="pool-remove" title="Remove from pool" aria-label="Remove from pool">${iconHtml("delete")}</button>
                </div>
              </div>`
          )
          .join("");
        renderTracks();
      }

      async function fetchPlaylists() {
        const response = await fetch("/api/playlists");
        if (handleUnauthorizedResponse(response)) return;
        if (!response.ok) return;
        playlistsCache = await response.json();
        playlistsEl.innerHTML = "";
        trackPlaylist.innerHTML = '<option value="">Library only</option>';
        if (playlistsCache.length === 0) {
          playlistsEl.innerHTML = '<div class="list-item">No playlists yet.</div>';
          selectedPlaylistId = null;
          renderTracks();
          return;
        }
        for (const playlist of playlistsCache) {
          const item = document.createElement("div");
          item.className = "list-item";
          item.innerHTML = `
            <div>
              <button class="inline secondary" data-action="select" data-playlist-id="${playlist.id}">
                ${playlist.name}
              </button>
              <span class="badge">${playlist.tracks.length} tracks</span>
            </div>
            <div class="actions">
              <button class="ghost" data-action="play" data-playlist-id="${playlist.id}">Play</button>
              <button class="ghost" data-action="playlist-pool" data-playlist-id="${playlist.id}">Add</button>
              <button class="ghost" data-action="export" data-playlist-id="${playlist.id}" data-playlist-name="${playlist.name}">Export</button>
                            <button class="ghost" data-action="delete" data-playlist-id="${playlist.id}" data-playlist-name="${playlist.name}">Delete</button>
            </div>
          `;
          playlistsEl.appendChild(item);

          const trackOption = document.createElement("option");
          trackOption.value = playlist.id;
          trackOption.textContent = playlist.name;
          trackPlaylist.appendChild(trackOption);

        }
        const selectedExists = selectedPlaylistId
          ? playlistsCache.some((playlist) => playlist.id === selectedPlaylistId)
          : false;
        if (!selectedExists && playlistsCache.length > 0) {
          const stored = localStorage.getItem(SELECTED_PLAYLIST_STORAGE_KEY);
          const storedExists = stored ? playlistsCache.some((playlist) => playlist.id === stored) : false;
          selectedPlaylistId = storedExists ? stored : playlistsCache[0].id;
        }
        if (selectedPlaylistId) {
          trackPlaylist.value = selectedPlaylistId;
          localStorage.setItem(SELECTED_PLAYLIST_STORAGE_KEY, selectedPlaylistId);
        } else {
          trackPlaylist.value = "";
          localStorage.removeItem(SELECTED_PLAYLIST_STORAGE_KEY);
        }
        renderTracks();
      }

      async function fetchTwitchLiveStatus() {
        if (!twitchLiveStatus) return;
        try {
          const response = await fetch("/api/twitch/channel-status", { cache: "no-store" });
          if (handleUnauthorizedResponse(response)) return;
          if (!response.ok) {
            twitchLiveStatus.textContent = "Twitch • unavailable";
            twitchLiveStatus.classList.remove("live", "offline");
            return;
          }
          const payload = await response.json();
          if (!payload.channel) {
            twitchLiveStatus.textContent = "Twitch • not linked";
            twitchLiveStatus.classList.remove("live", "offline");
            return;
          }
          if (!payload.live) {
            twitchLiveStatus.textContent = `Twitch • ${payload.channel} • offline`;
            twitchLiveStatus.classList.add("offline");
            twitchLiveStatus.classList.remove("live");
            return;
          }
          const viewers = Number(payload.viewerCount || 0).toLocaleString();
          twitchLiveStatus.textContent = `Twitch • ${payload.channel} • LIVE • ${viewers} viewers`;
          twitchLiveStatus.classList.add("live");
          twitchLiveStatus.classList.remove("offline");
        } catch {
          twitchLiveStatus.textContent = "Twitch • unavailable";
          twitchLiveStatus.classList.remove("live", "offline");
        }
      }

      async function fetchSettings() {
        const response = await fetch("/api/settings");
        if (handleUnauthorizedResponse(response)) return;
        if (!response.ok) return;
        const settings = await response.json();
        settingsVoteOptions.value = settings.vote_options ?? settings.voteOptions ?? 5;
        settingsVoteDuration.value = settings.vote_duration ?? settings.voteDuration ?? 30;
        settingsVoteLead.value = settings.vote_lead_time ?? settings.voteLeadTime ?? 20;
        const autoVoteSetting = settings.vote_auto_enabled ?? settings.voteAutoEnabled ?? 1;
        autoVoteToggle.checked = String(autoVoteSetting) !== "0";
        settingsTwitchWelcome.value = settings.twitch_welcome_message ?? settings.twitchWelcomeMessage ?? "";
        settingsTwitchVoteStart.value =
          settings.twitch_vote_start_message ?? settings.twitchVoteStartMessage ?? DEFAULT_TWITCH_MESSAGES.vote_start;
        settingsTwitchVoteOption.value =
          settings.twitch_vote_option_message ?? settings.twitchVoteOptionMessage ?? DEFAULT_TWITCH_MESSAGES.vote_option;
        settingsTwitchVoteEnd.value =
          settings.twitch_vote_end_message ?? settings.twitchVoteEndMessage ?? DEFAULT_TWITCH_MESSAGES.vote_end;
        settingsTwitchNowPlaying.value =
          settings.twitch_now_playing_message ?? settings.twitchNowPlayingMessage ?? DEFAULT_TWITCH_MESSAGES.now_playing;
        settingsTwitchNoActive.value =
          settings.twitch_no_active_vote_message ?? settings.twitchNoActiveVoteMessage ?? DEFAULT_TWITCH_MESSAGES.no_active;
        settingsTwitchVoteClosed.value =
          settings.twitch_vote_closed_message ?? settings.twitchVoteClosedMessage ?? DEFAULT_TWITCH_MESSAGES.vote_closed;
        settingsTwitchInvalidVote.value =
          settings.twitch_invalid_vote_message ?? settings.twitchInvalidVoteMessage ?? DEFAULT_TWITCH_MESSAGES.invalid_vote;
        settingsTwitchSkip.value =
          settings.twitch_skip_message ?? settings.twitchSkipMessage ?? DEFAULT_TWITCH_MESSAGES.skip;
        settingsTwitchPause.value =
          settings.twitch_pause_message ?? settings.twitchPauseMessage ?? DEFAULT_TWITCH_MESSAGES.pause;
        settingsTwitchResume.value =
          settings.twitch_resume_message ?? settings.twitchResumeMessage ?? DEFAULT_TWITCH_MESSAGES.resume;
        if (hypeEmotesInput) {
          hypeEmotesInput.value = settings.overlay_hype_emotes ?? HYPE_DEFAULTS.emotes;
          hypeThresholdPercentInput.value = Number(settings.overlay_hype_threshold_percent ?? HYPE_DEFAULTS.thresholdPercent);
          hypeDurationSecondsInput.value = Number(settings.overlay_hype_duration_seconds ?? HYPE_DEFAULTS.durationSeconds);
          hypeExtensionRatioInput.value = Number(settings.overlay_hype_extension_ratio ?? HYPE_DEFAULTS.extensionRatio);
          hypeUserCooldownSecondsInput.value = Number(settings.overlay_hype_user_cooldown_seconds ?? HYPE_DEFAULTS.userCooldownSeconds);
        }
      }

      async function fetchActiveVote() {
        const response = await fetch("/api/votes/active");
        if (handleUnauthorizedResponse(response)) return;
        if (!response.ok) return;
        const data = await response.json();
        if (!data.active) {
          setActiveVote(null);
          return;
        }
        setActiveVote(data.round);
      }

      function resetCustomCommandForm() {
        editingCustomCommandId = null;
        customCommandForm.reset();
        customCommandEnabled.checked = true;
        customCommandSubmit.textContent = "Add Command";
        customCommandCancel.classList.add("hidden");
      }

      function renderCustomCommands() {
        if (!customCommandsCache.length) {
          customCommandsList.innerHTML = '<div class="list-item">No custom commands yet.</div>';
          return;
        }
        customCommandsList.innerHTML = customCommandsCache
          .map((entry) => {
            const aliasText = entry.aliases.length ? `Aliases: ${entry.aliases.map((a) => `!${a}`).join(", ")}` : "Aliases: none";
            const statusText = entry.enabled ? "Enabled" : "Disabled";
            return `<div class="list-item custom-command-item" data-command-id="${entry.id}">
              <div class="custom-command-content">
                <div><strong>!${entry.command}</strong> <span class="badge">${statusText}</span></div>
                <div class="notice">${aliasText}</div>
                <div class="custom-command-response">${entry.response}</div>
              </div>
              <div class="actions">
                <button class="secondary" data-action="edit">Edit</button>
                <button class="ghost" data-action="delete">Delete</button>
              </div>
            </div>`;
          })
          .join("");
      }

      async function fetchCustomCommands() {
        const response = await fetch("/api/twitch/custom-commands");
        if (handleUnauthorizedResponse(response)) return;
        if (!response.ok) return;
        customCommandsCache = await response.json();
        renderCustomCommands();
      }

      function startCustomCommandEdit(commandId) {
        const entry = customCommandsCache.find((item) => item.id === commandId);
        if (!entry) return;
        editingCustomCommandId = entry.id;
        customCommandName.value = entry.command;
        customCommandAliases.value = entry.aliases.join(", ");
        customCommandResponse.value = entry.response;
        customCommandEnabled.checked = entry.enabled;
        customCommandSubmit.textContent = "Save Changes";
        customCommandCancel.classList.remove("hidden");
        customCommandName.focus();
      }

      
      function formatTagPills(tags) {
        if (!Array.isArray(tags) || tags.length === 0) return "";
        return tags.map((tag) => `<span class="badge">${tag}</span>`).join(" ");
      }

      async function fetchLibraryTracks() {
        const response = await fetch("/api/library/tracks");
        if (handleUnauthorizedResponse(response)) return;
        if (!response.ok) return;
        libraryTracksCache = await response.json();
        renderLibraryTracks();
      }

      function parseTagFilterValue(value) {
        return String(value || "")
          .split(",")
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean);
      }

      function formatDuration(totalSeconds) {
        const value = Number(totalSeconds);
        if (!Number.isFinite(value) || value <= 0) return "--";
        const hours = Math.floor(value / 3600);
        const minutes = Math.floor((value % 3600) / 60);
        const seconds = Math.floor(value % 60);
        if (hours > 0) {
          return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        }
        return `${minutes}:${String(seconds).padStart(2, "0")}`;
      }

      function formatDateTime(value) {
        if (!value) return "--";
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return "--";
        return parsed.toLocaleString();
      }

      function getSortValue(track, key) {
        if (key === "name") return String(track.title || track.youtube_id || "").toLowerCase();
        if (key === "youtube") return String(track.youtube_id || "").toLowerCase();
        if (key === "duration") return Number(track.duration_sec || 0);
        if (key === "volume") return Number(track.volume_adjust_db || 0);
        if (key === "score") return Number(track.score || 0);
        if (key === "intro") return Number(track.intro_sec || 0);
        if (key === "outro") return Number(track.outro_sec || 0);
        if (key === "status") return String(track.download_status || "").toLowerCase();
        if (key === "addedBy") return String(track.added_by_username || "").toLowerCase();
        if (key === "addedAt") return String(track.created_at || "").toLowerCase();
        return "";
      }

      function sortLibraryTracks(tracks) {
        const direction = librarySort.direction === "desc" ? -1 : 1;
        return [...tracks].sort((a, b) => {
          const left = getSortValue(a, librarySort.key);
          const right = getSortValue(b, librarySort.key);
          if (left < right) return -1 * direction;
          if (left > right) return 1 * direction;
          return 0;
        });
      }

      function renderLibraryColumnsOptions() {
        libraryColumnsOptions.innerHTML = LIBRARY_COLUMNS.map((column) => `
          <label class="card-toggle">
            <input type="checkbox" data-column-key="${column.key}" ${visibleLibraryColumns.has(column.key) ? "checked" : ""} />
            ${column.label}
          </label>
        `).join("");
      }

      function renderLibraryTracks() {
        if (!libraryTracksCache.length) {
          libraryTracksEl.innerHTML = '<div class="list-item">No tracks in library yet.</div>';
          return;
        }
        const titleQuery = String(librarySearch.value || "").trim().toLowerCase();
        const includeTags = parseTagFilterValue(libraryTagsInclude.value);
        const excludeTags = parseTagFilterValue(libraryTagsExclude.value);
        const addedByQuery = String(libraryAddedBySearch?.value || "").trim().toLowerCase();
        const filtered = libraryTracksCache.filter((track) => {
          const title = String(track.title || track.youtube_id || "").toLowerCase();
          const tags = (track.tags || []).map((tag) => String(tag).toLowerCase());
          if (titleQuery && !title.includes(titleQuery)) return false;
          if (includeTags.length > 0 && !includeTags.every((tag) => tags.includes(tag))) return false;
          if (excludeTags.some((tag) => tags.includes(tag))) return false;
          const addedBy = String(track.added_by_username || "admin").toLowerCase();
          if (addedByQuery && !addedBy.includes(addedByQuery)) return false;
          return true;
        });
        if (!filtered.length) {
          libraryTracksEl.innerHTML = '<div class="list-item">No library tracks match the current filters.</div>';
          return;
        }

        const sorted = sortLibraryTracks(filtered);
        const headers = LIBRARY_COLUMNS.filter((column) => visibleLibraryColumns.has(column.key));
        const headerHtml = headers
          .map((column) => {
            const active = librarySort.key === column.key;
            const arrow = active ? (librarySort.direction === "asc" ? " ▲" : " ▼") : "";
            return `<th><button class="table-sort" data-action="library-sort" data-sort-key="${column.key}">${column.label}${arrow}</button></th>`;
          })
          .join("");
        const rowsHtml = sorted
          .map((track) => {
            const status = track.download_status || "unknown";
            const tags = formatTagPills(track.tags || []);
            const cells = [];
            if (visibleLibraryColumns.has("name")) {
              const isNew = (track.tags || []).some((tag) => String(tag).trim().toLowerCase() === "new");
              cells.push(`<td><div class="table-title">${track.title || track.youtube_id} ${isNew ? '<span class="badge">new</span>' : ''}</div><div class="notice">${tags}</div></td>`);
            }
            if (visibleLibraryColumns.has("youtube")) cells.push(`<td><a href="${track.url}" target="_blank" rel="noopener noreferrer">${track.youtube_id}</a></td>`);
            if (visibleLibraryColumns.has("duration")) cells.push(`<td>${formatDuration(track.duration_sec)}</td>`);
            if (visibleLibraryColumns.has("volume")) cells.push(`<td>${Number(track.volume_adjust_db || 0).toFixed(1)} dB</td>`);
            if (visibleLibraryColumns.has("score")) cells.push(`<td>${Number(track.score || 0)}</td>`);
            if (visibleLibraryColumns.has("intro")) cells.push(`<td>${Number(track.intro_sec || 0).toFixed(1)}s</td>`);
            if (visibleLibraryColumns.has("outro")) cells.push(`<td>${Number(track.outro_sec || 0).toFixed(1)}s</td>`);
            if (visibleLibraryColumns.has("status")) cells.push(`<td><span class="badge">${status}</span></td>`);
            if (visibleLibraryColumns.has("addedBy")) cells.push(`<td>${track.added_by_username || "admin"}</td>`);
            if (visibleLibraryColumns.has("addedAt")) cells.push(`<td>${formatDateTime(track.created_at)}</td>`);
            return `<tr data-library-track-id="${track.id}" data-track-title="${track.title || ""}">${cells.join("")}
              <td class="table-actions">
                <button class="secondary icon-only" data-action="library-rename" title="Rename" aria-label="Rename">${iconHtml("rename")}</button>
                <button class="secondary icon-only" data-action="library-tags" title="Tags" aria-label="Edit tags">${iconHtml("tags")}</button>
                <button class="secondary icon-only" data-action="library-audio" title="Audio settings" aria-label="Audio settings">${iconHtml("audio")}</button>
                <button class="secondary icon-only" data-action="library-trim" title="Set intro/outro" aria-label="Set intro/outro">${iconHtml("trim")}</button>
                ${currentUser?.role === "admin" ? `<button class="secondary icon-only" data-action="library-calibrate-score" title="Calibrate score" aria-label="Calibrate score">${iconHtml("score")}</button>` : ""}
                <button class="secondary icon-only" data-action="library-add-playlist" title="Add to playlists" aria-label="Add to playlists">${iconHtml("playlistAdd")}</button>
                <button class="ghost icon-only" data-action="library-delete" title="Delete" aria-label="Delete">${iconHtml("delete")}</button>
              </td>
            </tr>`;
          })
          .join("");

        libraryTracksEl.innerHTML = `<table class="library-table"><thead><tr>${headerHtml}<th>Actions</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
      }
async function fetchDownloads() {
        const response = await fetch("/api/downloads");
        if (!response.ok) return;
        const downloads = await response.json();
        if (!downloads.length) {
          downloadQueueEl.innerHTML = '<div class="list-item">No downloads yet.</div>';
          return;
        }
        downloadQueueEl.innerHTML = downloads
          .map((item) => {
            const label = item.title || item.youtube_id;
            const status = item.status;
            const details = item.error ? ` - ${item.error}` : "";
            return `<div class="list-item"><span>${label} (${item.playlist_name || "Library"})${details}</span><span class="badge">${status}</span></div>`;
          })
          .join("");
      }

      playlistsEl.addEventListener("click", async (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const action = button.dataset.action;
        const playlistId = button.dataset.playlistId;
        if (!playlistId) return;
        if (action === "select") {
          selectedPlaylistId = playlistId;
          trackPlaylist.value = playlistId;
          localStorage.setItem(SELECTED_PLAYLIST_STORAGE_KEY, selectedPlaylistId);
          renderTracks();
        }
        if (action === "play") {
          await fetch(`/api/playlists/${playlistId}/play`, { method: "POST" });
          fetchState();
        }
        if (action === "playlist-pool") {
          await fetch(`/api/playlists/${playlistId}/add-to-pool`, { method: "POST" });
          fetchPool();
        }
        if (action === "export") {
          const a = document.createElement("a");
          a.href = `/api/playlists/${playlistId}/export`;
          a.click();
        }
        if (action === "delete") {
          const name = button.dataset.playlistName || "this playlist";
          if (window.confirm(`Delete ${name}? This cannot be undone.`)) {
            await fetch(`/api/playlists/${playlistId}`, { method: "DELETE" });
            if (selectedPlaylistId === playlistId) {
              selectedPlaylistId = null;
              localStorage.removeItem(SELECTED_PLAYLIST_STORAGE_KEY);
            }
            fetchPlaylists();
          }
        }
      });

      trackPlaylist.addEventListener("change", () => {
        selectedPlaylistId = trackPlaylist.value || null;
        if (selectedPlaylistId) {
          localStorage.setItem(SELECTED_PLAYLIST_STORAGE_KEY, selectedPlaylistId);
        } else {
          localStorage.removeItem(SELECTED_PLAYLIST_STORAGE_KEY);
        }
        renderTracks();
      });

      trackFilter.addEventListener("input", () => {
        renderTracks();
      });

      tracksEl.addEventListener("click", async (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const action = button.dataset.action;
        const wrapper = button.closest(".list-item");
        const trackId = wrapper?.dataset.trackId;
        const isDisabled = wrapper?.dataset.trackDisabled === "true";
        if (!trackId || !selectedPlaylistId) return;
        if (action === "enqueue") {
          await fetch("/api/queue/enqueue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trackId, source: "dashboard" })
          });
        }
        if (action === "remove") {
          await fetch(`/api/playlists/${selectedPlaylistId}/tracks/${trackId}`, { method: "DELETE" });
        }
        if (action === "pool-add") {
          await fetch("/api/pool/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trackId })
          });
          fetchPool();
        }
        if (action === "pool-remove") {
          await fetch(`/api/pool/${trackId}`, { method: "DELETE" });
          fetchPool();
        }
        if (action === "toggle-disabled") {
          await fetch(`/api/playlists/${selectedPlaylistId}/tracks/${trackId}/disable`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ disabled: !isDisabled })
          });
        }
        fetchPlaylists();
      });

      tracksEl.addEventListener("dragstart", (event) => {
        const item = event.target.closest(".list-item[data-track-id]");
        if (!item) return;
        draggedTrackId = item.dataset.trackId || null;
        item.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "move";
      });

      tracksEl.addEventListener("dragend", () => {
        draggedTrackId = null;
        tracksEl.querySelectorAll(".list-item").forEach((item) => item.classList.remove("is-dragging", "drag-over"));
      });

      tracksEl.addEventListener("dragover", (event) => {
        const target = event.target.closest(".list-item[data-track-id]");
        if (!draggedTrackId || !target) return;
        event.preventDefault();
        target.classList.add("drag-over");
        event.dataTransfer.dropEffect = "move";
      });

      tracksEl.addEventListener("dragleave", (event) => {
        const target = event.target.closest(".list-item[data-track-id]");
        if (target) target.classList.remove("drag-over");
      });

      tracksEl.addEventListener("drop", async (event) => {
        const target = event.target.closest(".list-item[data-track-id]");
        if (!draggedTrackId || !target) return;
        event.preventDefault();
        target.classList.remove("drag-over");
        const targetTrackId = target.dataset.trackId;
        await moveTrackToTarget(draggedTrackId, targetTrackId);
        fetchPlaylists();
      });

      queueEl.addEventListener("click", async (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const wrapper = button.closest(".list-item[data-queue-id]");
        const queueId = wrapper?.dataset.queueId;
        if (!queueId) return;
        if (button.dataset.action === "queue-remove") {
          await fetch(`/api/queue/${queueId}`, { method: "DELETE" });
          fetchState();
        }
      });

      queueEl.addEventListener("dragstart", (event) => {
        const item = event.target.closest(".list-item[data-queue-id]");
        if (!item) return;
        draggedQueueId = item.dataset.queueId || null;
        item.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "move";
      });

      queueEl.addEventListener("dragend", () => {
        draggedQueueId = null;
        queueEl.querySelectorAll(".list-item").forEach((item) => item.classList.remove("is-dragging", "drag-over"));
      });

      queueEl.addEventListener("dragover", (event) => {
        const target = event.target.closest(".list-item[data-queue-id]");
        if (!draggedQueueId || !target) return;
        event.preventDefault();
        target.classList.add("drag-over");
        event.dataTransfer.dropEffect = "move";
      });

      queueEl.addEventListener("dragleave", (event) => {
        const target = event.target.closest(".list-item[data-queue-id]");
        if (target) target.classList.remove("drag-over");
      });

      queueEl.addEventListener("drop", async (event) => {
        const target = event.target.closest(".list-item[data-queue-id]");
        if (!draggedQueueId || !target) return;
        event.preventDefault();
        target.classList.remove("drag-over");
        const targetQueueId = target.dataset.queueId;
        await moveQueueToTarget(draggedQueueId, targetQueueId);
        fetchState();
      });

      poolEl.addEventListener("click", async (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const action = button.dataset.action;
        const wrapper = button.closest(".list-item");
        const trackId = wrapper?.dataset.trackId;
        if (!trackId) return;
        if (action === "pool-enqueue") {
          await fetch("/api/pool/enqueue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trackId })
          });
          fetchState();
        }
        if (action === "pool-remove") {
          await fetch(`/api/pool/${trackId}`, { method: "DELETE" });
        }
        fetchPool();
      });

      function closeRenameModal() {
        renameModal.classList.add("hidden");
        renameTrackId = null;
        renameInput.value = "";
      }

      renameCancel.addEventListener("click", () => {
        closeRenameModal();
      });

      renameModal.addEventListener("click", (event) => {
        if (event.target === renameModal) {
          closeRenameModal();
        }
      });

      renameSave.addEventListener("click", async () => {
        const title = renameInput.value.trim();
        if (!renameTrackId || !title) return;
        await fetch(`/api/library/tracks/${renameTrackId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title })
        });
        closeRenameModal();
        fetchPlaylists();
      });

      importPlaylistJsonButton.addEventListener("click", () => {
        playlistImportFile.dataset.playlistId = "";
        playlistImportFile.click();
      });

      playlistImportFile.addEventListener("change", async () => {
        const file = playlistImportFile.files?.[0];
        if (!file) return;
        const text = await file.text();
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          window.alert("Invalid JSON file.");
          return;
        }
        const parsed = payload?.playlist || payload;
        const importName = String(parsed.name || file.name.replace(/\.json$/i, "")).trim();
        if (!importName) {
          window.alert("Playlist name missing in JSON.");
          return;
        }

        let mode = "append";
        let playlistId = null;
        const existingByName = playlistsCache.find(
          (playlist) => String(playlist.name || "").trim().toLowerCase() === importName.toLowerCase()
        );
        if (existingByName) {
          const replaceConfirmed = window.confirm(
            `Playlist "${importName}" already exists. Replace its tracks with this import?`
          );
          if (!replaceConfirmed) {
            playlistImportFile.value = "";
            return;
          }
          mode = "replace";
          playlistId = existingByName.id;
        }

        await fetch("/api/playlists/import-json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playlistId,
            mode,
            name: importName,
            tracks: parsed.tracks || []
          })
        });
        playlistImportFile.value = "";
        fetchPlaylists();
        fetchDownloads();
      });

      document.getElementById("open-stream").addEventListener("click", () => {
        window.open("/player/stream", "erwin-stream", "width=1100,height=720");
      });

      copyOverlayEndpointButton?.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(overlayEndpoint);
          showToast("Overlay endpoint copied.", "success");
        } catch {
          showToast("Unable to access clipboard. Copy from the field above.", "warning");
          overlayEndpointInput?.focus();
          overlayEndpointInput?.select();
        }
      });

      openOverlayTestButton?.addEventListener("click", async () => {
        const response = await fetch("/api/overlay/test", { method: "POST" });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          showToast(payload.error || "Unable to trigger overlay test animation.", "warning");
          return;
        }
        showToast("Overlay test animation triggered.", "success");
      });

      overlayHypeTestButton?.addEventListener("click", async () => {
        const response = await fetch("/api/overlay/hype/test", { method: "POST" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          showToast(payload.error || "Unable to trigger hype test.", "warning");
          return;
        }
        showToast("Hype test triggered.", "success");
      });

      overlayHypeForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (overlayHypeStatus) overlayHypeStatus.textContent = "Saving hype settings...";
        const response = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            overlay_hype_emotes: hypeEmotesInput?.value || "",
            overlay_hype_threshold_percent: Number(hypeThresholdPercentInput?.value || HYPE_DEFAULTS.thresholdPercent),
            overlay_hype_duration_seconds: Number(hypeDurationSecondsInput?.value || HYPE_DEFAULTS.durationSeconds),
            overlay_hype_extension_ratio: Number(hypeExtensionRatioInput?.value || HYPE_DEFAULTS.extensionRatio),
            overlay_hype_user_cooldown_seconds: Number(hypeUserCooldownSecondsInput?.value || HYPE_DEFAULTS.userCooldownSeconds)
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (overlayHypeStatus) overlayHypeStatus.textContent = payload.error || "Unable to save hype settings.";
          return;
        }
        if (overlayHypeStatus) overlayHypeStatus.textContent = "Hype settings saved.";
        showToast("Hype settings saved.", "success");
      });

      startVoteButton.addEventListener("click", async () => {
        await fetch("/api/votes/start", { method: "POST" });
        fetchActiveVote();
      });

      playlistForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const name = playlistForm["playlist-name"].value;
        const response = await fetch("/api/playlists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name })
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          window.alert(payload.error || "Unable to create playlist.");
          return;
        }
        playlistForm.reset();
        fetchPlaylists();
      });

      trackForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const playlistId = trackForm["track-playlist"].value;
        const url = trackForm["track-url"].value;
        if (!url) return;
        const response = await fetch("/api/library/tracks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playlistId: playlistId || undefined, url: url.trim() })
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          window.alert(payload.error || "Unable to queue download.");
          return;
        }
        trackForm.reset();
        fetchPlaylists();
        fetchDownloads();
        fetchLibraryTracks();
      });

      
      libraryTracksEl.addEventListener("click", async (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const wrapper = button.closest("[data-library-track-id]");
        const trackId = wrapper?.dataset.libraryTrackId;
        if (!trackId) return;
        const action = button.dataset.action;
        if (action === "library-rename") {
          const next = window.prompt("New title", wrapper.dataset.trackTitle || "");
          if (next && next.trim()) {
            await fetch(`/api/library/tracks/${trackId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: next.trim() }) });
          }
        }
        if (action === "library-tags") {
          const existing = (libraryTracksCache.find((track) => track.id === trackId)?.tags || []).join(", ");
          const next = window.prompt("Tags (comma separated)", existing);
          if (next !== null) {
            await fetch(`/api/library/tracks/${trackId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: next }) });
          }
        }
        if (action === "library-audio") {
          const track = libraryTracksCache.find((item) => item.id === trackId);
          const volumeAdjustDb = window.prompt("Volume adjust (dB, -24..24)", String(track?.volume_adjust_db || 0));
          if (volumeAdjustDb === null) return;
          const introSec = window.prompt("Intro trim in seconds", String(track?.intro_sec || 0));
          if (introSec === null) return;
          const outroSec = window.prompt("Outro trim in seconds", String(track?.outro_sec || 0));
          if (outroSec === null) return;
          await fetch(`/api/library/tracks/${trackId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ volumeAdjustDb: Number(volumeAdjustDb), introSec: Number(introSec), outroSec: Number(outroSec) }) });
        }
        if (action === "library-trim") {
          const track = libraryTracksCache.find((item) => item.id === trackId);
          const introSec = window.prompt("Intro trim in seconds", String(track?.intro_sec || 0));
          if (introSec === null) return;
          const outroSec = window.prompt("Outro trim in seconds", String(track?.outro_sec || 0));
          if (outroSec === null) return;
          await fetch(`/api/library/tracks/${trackId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ introSec: Number(introSec), outroSec: Number(outroSec) }) });
        }
        if (action === "library-calibrate-score") {
          const track = libraryTracksCache.find((item) => item.id === trackId);
          const next = window.prompt("Set track score (-100 to 100)", String(track?.score ?? 0));
          if (next === null) return;
          const response = await fetch(`/api/tracks/${trackId}/score`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ score: Number(next) })
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            alert(payload.error || "Unable to calibrate score");
            return;
          }
        }
        if (action === "library-add-playlist") {
          playlistPickTrackId = trackId;
          playlistPickInitialSelection = new Set(
            playlistsCache
              .filter((playlist) => Array.isArray(playlist.tracks) && playlist.tracks.some((track) => track.id === trackId))
              .map((playlist) => playlist.id)
          );
          playlistPickOptions.innerHTML = playlistsCache.map((playlist) => `
            <label class="card-toggle">
              <input type="checkbox" value="${playlist.id}" ${playlistPickInitialSelection.has(playlist.id) ? "checked" : ""} />
              ${playlist.name}
            </label>
          `).join("");
          playlistPickModal.classList.remove("hidden");
          return;
        }
        if (action === "library-delete") {
          if (window.confirm("Delete track from library and all playlists?")) {
            await fetch(`/api/library/tracks/${trackId}`, { method: "DELETE" });
          }
        }
        fetchPlaylists();
        fetchLibraryTracks();
      });

      [librarySearch, libraryTagsInclude, libraryTagsExclude, libraryAddedBySearch].forEach((input) => {
        input.addEventListener("input", () => {
          renderLibraryTracks();
        });
      });


      libraryTracksEl.addEventListener("click", (event) => {
        const sortButton = event.target.closest("[data-action='library-sort']");
        if (!sortButton) return;
        const sortKey = sortButton.dataset.sortKey;
        if (!sortKey) return;
        if (librarySort.key === sortKey) {
          librarySort.direction = librarySort.direction === "asc" ? "desc" : "asc";
        } else {
          librarySort.key = sortKey;
          librarySort.direction = "asc";
        }
        renderLibraryTracks();
      });

      libraryColumnsButton?.addEventListener("click", () => {
        renderLibraryColumnsOptions();
        libraryColumnsModal.classList.remove("hidden");
      });

      libraryColumnsCancel?.addEventListener("click", () => {
        libraryColumnsModal.classList.add("hidden");
      });

      libraryColumnsSave?.addEventListener("click", () => {
        const checked = Array.from(libraryColumnsOptions.querySelectorAll("input[type='checkbox']:checked"))
          .map((input) => input.dataset.columnKey)
          .filter(Boolean);
        visibleLibraryColumns = new Set(checked.length ? checked : DEFAULT_LIBRARY_COLUMNS);
        localStorage.setItem(LIBRARY_COLUMNS_STORAGE_KEY, JSON.stringify(Array.from(visibleLibraryColumns)));
        libraryColumnsModal.classList.add("hidden");
        renderLibraryTracks();
      });

      playlistPickCancel?.addEventListener("click", () => {
        playlistPickTrackId = null;
        playlistPickInitialSelection = new Set();
        playlistPickModal.classList.add("hidden");
      });

      playlistPickSave?.addEventListener("click", async () => {
        if (!playlistPickTrackId) return;
        const selectedIds = new Set(
          Array.from(playlistPickOptions.querySelectorAll("input[type='checkbox']:checked")).map((input) => input.value)
        );
        const toAdd = Array.from(selectedIds).filter((playlistId) => !playlistPickInitialSelection.has(playlistId));
        const toRemove = Array.from(playlistPickInitialSelection).filter((playlistId) => !selectedIds.has(playlistId));

        for (const playlistId of toAdd) {
          await fetch(`/api/playlists/${playlistId}/tracks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trackId: playlistPickTrackId })
          });
        }
        for (const playlistId of toRemove) {
          await fetch(`/api/playlists/${playlistId}/tracks/${playlistPickTrackId}`, {
            method: "DELETE"
          });
        }

        playlistPickTrackId = null;
        playlistPickInitialSelection = new Set();
        playlistPickModal.classList.add("hidden");
        fetchPlaylists();
        fetchLibraryTracks();
      });

      exportLibraryJsonButton.addEventListener("click", () => {
        const a = document.createElement("a");
        a.href = "/api/library/export";
        a.click();
      });

      importLibraryJsonButton.addEventListener("click", () => {
        libraryImportFile.click();
      });

      libraryImportFile.addEventListener("change", async () => {
        const file = libraryImportFile.files?.[0];
        if (!file) return;
        if (libraryImportStatus) {
          libraryImportStatus.textContent = `Importing ${file.name}...`;
        }
        try {
          const text = await file.text();
          let payload;
          try {
            payload = JSON.parse(text);
          } catch {
            if (libraryImportStatus) {
              libraryImportStatus.textContent = "Import failed: invalid library JSON file.";
            }
            return;
          }
          const response = await fetch("/api/library/import-json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) {
            let errorMessage = typeof result.error === "string" && result.error.trim()
              ? result.error.trim()
              : "Unable to import library JSON.";
            if (response.status === 413) {
              errorMessage = "JSON file is too large. Increase server import size limit or split the file.";
            }
            if (libraryImportStatus) {
              libraryImportStatus.textContent = `Import failed: ${errorMessage}`;
            }
            return;
          }
          const updated = Number(result.updated || 0);
          const missing = Array.isArray(result.missing) ? result.missing.length : 0;
          const missingSuffix = missing ? ` (${missing} track IDs were not found in this library)` : "";
          if (libraryImportStatus) {
            libraryImportStatus.textContent = `Import complete: updated ${updated} track${updated === 1 ? "" : "s"}${missingSuffix}.`;
          }
          fetchLibraryTracks();
          fetchPlaylists();
        } catch {
          if (libraryImportStatus) {
            libraryImportStatus.textContent = "Import failed: network or server error.";
          }
        } finally {
          libraryImportFile.value = "";
        }
      });

document.getElementById("logout").addEventListener("click", async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
      });

      document.getElementById("clear-downloads").addEventListener("click", async () => {
        await fetch("/api/downloads/clear", { method: "POST" });
        fetchDownloads();
      });

      autoVoteToggle.addEventListener("change", async () => {
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vote_auto_enabled: autoVoteToggle.checked ? 1 : 0 })
        });
      });

      settingsForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        settingsStatus.textContent = "Saving...";
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vote_options: Number(settingsVoteOptions.value || 5),
            vote_duration: Number(settingsVoteDuration.value || 30),
            vote_lead_time: Number(settingsVoteLead.value || 20),
            vote_auto_enabled: autoVoteToggle.checked ? 1 : 0,
            twitch_welcome_message: settingsTwitchWelcome.value,
            twitch_vote_start_message: settingsTwitchVoteStart.value,
            twitch_vote_option_message: settingsTwitchVoteOption.value,
            twitch_vote_end_message: settingsTwitchVoteEnd.value,
            twitch_now_playing_message: settingsTwitchNowPlaying.value,
            twitch_no_active_vote_message: settingsTwitchNoActive.value,
            twitch_vote_closed_message: settingsTwitchVoteClosed.value,
            twitch_invalid_vote_message: settingsTwitchInvalidVote.value,
            twitch_skip_message: settingsTwitchSkip.value,
            twitch_pause_message: settingsTwitchPause.value,
            twitch_resume_message: settingsTwitchResume.value
          })
        });
        settingsStatus.textContent = "Settings saved.";
        setTimeout(() => {
          settingsStatus.textContent = "";
        }, 3000);
      });

      customCommandCancel.addEventListener("click", () => {
        resetCustomCommandForm();
      });

      customCommandForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        customCommandStatus.textContent = "Saving command...";
        const payload = {
          command: customCommandName.value.trim(),
          aliases: customCommandAliases.value,
          response: customCommandResponse.value,
          enabled: customCommandEnabled.checked
        };
        const method = editingCustomCommandId ? "PUT" : "POST";
        const url = editingCustomCommandId
          ? `/api/twitch/custom-commands/${editingCustomCommandId}`
          : "/api/twitch/custom-commands";
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          customCommandStatus.textContent = result.error || "Unable to save command.";
          return;
        }
        customCommandStatus.textContent = editingCustomCommandId
          ? "Custom command updated."
          : "Custom command created.";
        resetCustomCommandForm();
        fetchCustomCommands();
      });

      customCommandsList.addEventListener("click", async (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const row = button.closest("[data-command-id]");
        if (!row) return;
        const commandId = row.dataset.commandId;
        if (button.dataset.action === "edit") {
          startCustomCommandEdit(commandId);
          return;
        }
        if (button.dataset.action === "delete") {
          const entry = customCommandsCache.find((item) => item.id === commandId);
          const label = entry ? `!${entry.command}` : "this command";
          if (!confirm(`Delete ${label}?`)) {
            return;
          }
          const response = await fetch(`/api/twitch/custom-commands/${commandId}`, {
            method: "DELETE"
          });
          if (!response.ok) {
            customCommandStatus.textContent = "Unable to delete command.";
            return;
          }
          if (editingCustomCommandId === commandId) {
            resetCustomCommandForm();
          }
          customCommandStatus.textContent = "Custom command deleted.";
          fetchCustomCommands();
        }
      });


      connectChannelButton.addEventListener("click", () => {
        window.location.href = "/auth/twitch/channel";
      });

      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
      ws.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.event === "STATE_UPDATE" || message.event === "QUEUE_UPDATE") {
          fetchState();
          return;
        }
        if (message.event === "PLAYLIST_UPDATE") {
          fetchPlaylists();
          return;
        }
        if (message.event === "DOWNLOAD_UPDATE") {
          fetchDownloads();
          fetchLibraryTracks();
          fetchPlaylists();
          return;
        }
        if (message.event === "POOL_UPDATE") {
          fetchPool();
          return;
        }
        if (message.event === "SETTINGS_UPDATE") {
          fetchSettings();
          return;
        }
        if (message.event === "TWITCH_COMMANDS_UPDATE") {
          fetchCustomCommands();
          return;
        }
        if (message.event === "VOTE_START") {
          setActiveVote(message.payload);
          return;
        }
        if (message.event === "VOTE_UPDATE") {
          if (activeVote && message.payload.roundId === activeVote.roundId) {
            setActiveVote({ ...activeVote, counts: message.payload.counts });
          } else if (!activeVote) {
            setActiveVote(message.payload);
          }
          return;
        }
        if (message.event === "VOTE_END") {
          if (activeVote && message.payload.roundId === activeVote.roundId) {
            setActiveVote({ ...message.payload, status: "Ended" });
          }
          setTimeout(() => {
            setActiveVote(null);
          }, 5000);
          return;
        }
        if (message.event === "CHAT_MESSAGE") {
          appendChatMessage(message.payload);
        }
      });

      (async () => {
        await loadAvailableIcons();
        const me = await fetchMe();
        if (!me) {
          return;
        }
        await fetchUsers();
        await fetchChannelAuthStatus();
        await fetchTwitchLiveStatus();
        window.setInterval(fetchTwitchLiveStatus, 10000);
        resetCustomCommandForm();
        fetchState();
        fetchPlaylists();
        fetchDownloads();
        fetchLibraryTracks();
        fetchSettings();
        fetchActiveVote();
        fetchPool();
        fetchCustomCommands();
      })();
