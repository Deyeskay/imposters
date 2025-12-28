const socket = io();



/* ---------- UUID ---------- */

function getPlayerUUID() {
  let uuid = localStorage.getItem("playerUUID");
  if (!uuid) {
    uuid = crypto.randomUUID();
    localStorage.setItem("playerUUID", uuid);
  }
  return uuid;
}

const playerUUID = getPlayerUUID();

/* ---------- AUTO REJOIN ---------- */
/*
socket.on("connect", () => {
  const saved = localStorage.getItem("wordImposterSession");
  if (!saved) return;

  const { roomId, playerName } = JSON.parse(saved);
  socket.emit("join_room", { roomId, playerName, playerUUID });
});
*/

let roomState = null;
let voteSubmitted = false;

/* ---------- UI ---------- */

function show(id) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}
 

/* ---------- JOIN / LEAVE ---------- */

function joinRoom() {
  const name = nameInput.value.trim();
  const roomId = roomInput.value.trim(); // correct variable

  if (!name) {
    alert("Enter your name");
    return;
  }

  if (!roomId) {
    alert("Enter Room ID");
    return;
  }

  // Save session for refresh / reconnection
  localStorage.setItem(
    "wordImposterSession",
    JSON.stringify({
      roomId: roomId,
      playerName: name,
      playerUUID: playerUUID
    })
  );

  // Join room
  socket.emit("join_room", {
    roomId: roomId,
    playerName: name,
    playerUUID: playerUUID
  });
}


function leaveRoom() {
  localStorage.removeItem("wordImposterSession");
  socket.disconnect();
  location.reload();
}

/* ---------- HELPERS ---------- */

function getPlayerNameByUUID(uuid) {
  const p = roomState.players.find(p => p.uuid === uuid);
  return p ? p.name : "Unknown";
}

/* ---------- DOM READY ---------- */

document.addEventListener("DOMContentLoaded", () => {
  // ✅ Always show something on refresh
  show("join");
  leaveRoomBtn.classList.add("hidden");
});

/* ---------- SOCKET CONNECT + AUTO REJOIN ---------- */

socket.on("connect", () => {
  const saved = localStorage.getItem("wordImposterSession");
  if (!saved) return;

  const { roomId, playerName } = JSON.parse(saved);

  socket.emit("join_room", {
    roomId,
    playerName,
    playerUUID
  });
});

/* ---------- SOCKET EVENTS ---------- */

socket.on("room_state", state => {
  roomCode.textContent = `Room: ${state.roomId}`;
  roomState = state;
  leaveRoomBtn.classList.remove("hidden");

  if (state.phase === "REVEAL") {
    voteSubmitted = false;
    submitVoteBtn.disabled = false;
    voteSelect.disabled = false;
    voteStatus.classList.add("hidden");
    submitVoteBtn.textContent = "Submit Vote";
  }

  show(
    state.phase === "LOBBY" ? "lobby" :
    state.phase === "REVEAL" ? "reveal" :
    state.phase === "VOTING" ? "voting" :
    "results"
  );

  playerList.innerHTML = "";
  state.players.forEach(p => {
    const li = document.createElement("li");
	  
	// Name + score
	li.textContent = `${p.name} (${p.score})`;
	  
    // YOU tag (only for self)
	  if (p.uuid === playerUUID) {
	    const youTag = document.createElement("span");
	    youTag.textContent = " YOU";
	    youTag.className = "li-tags";
	    li.appendChild(youTag);
	  }

	// HOST tag + crown
	if (p.isHost) {
	    const hostTag = document.createElement("span");
	    hostTag.textContent = " 👑 HOST";
	    hostTag.className = "li-tags";
	    li.appendChild(hostTag);
	  }
	   
    playerList.appendChild(li);
  });
  
  // --- Voting player list ---
	playerVoteList.innerHTML = "";

	if (state.phase === "VOTING") {
	  state.players
		.filter(p => p.connected)
		.forEach(p => {
		  const li = document.createElement("li");
		  li.textContent = p.name;

		  if (!p.hasVoted) li.classList.add("player-not-voted");
		  if (p.isHost) li.textContent += " 👑";

		  playerVoteList.appendChild(li);
		});
	}

  hostControls.classList.toggle(
    "hidden",
    state.hostId !== playerUUID || state.phase !== "LOBBY"
  );

  openVotingBtn.classList.toggle(
    "hidden",
    state.hostId !== playerUUID || state.phase !== "REVEAL"
  );

  nextRoundBtn.classList.toggle(
    "hidden",
    state.hostId !== playerUUID || state.phase !== "RESULTS"
  );
  
  forceEndVotingBtn.classList.toggle(
	"hidden",
	state.hostId !== playerUUID || state.phase !== "VOTING"
  );

if (state.phase === "VOTING") {
  //const connected = state.players.filter(p => p.socketId !== null);
  const connected = state.players.filter(p => p.connected);

  const voted = connected.filter(p => p.hasVoted).length;
  voteProgress.textContent = `${voted} / ${connected.length} voted`;
} else {
  voteProgress.textContent = "";
}


// Voting list
  if (state.phase === "VOTING" && !voteSubmitted) {
    voteSelect.innerHTML = "";
    state.players
      .filter(p => p.uuid !== playerUUID)
      .forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.uuid;
        opt.textContent = p.name;
        voteSelect.appendChild(opt);
      });
  }
// Scores
  if (state.phase === "RESULTS") {
    scoreBoard.innerHTML = "";
    state.players.forEach(p => {
      const li = document.createElement("li");
      li.textContent = `${p.name}: ${p.score}`;
      scoreBoard.appendChild(li);
    });
  }
});

socket.on("private_reveal", data => {
  categoryText.textContent = data.showCategory ? data.category : "";
  wordText.textContent = data.word;
  roleText.textContent = data.showRole ? data.role : "";
});

socket.on("round_results", data => {
  resultsText.innerHTML = `
    <p><strong>Imposter:</strong> ${getPlayerNameByUUID(data.imposterUUID)}</p>
    <p><strong>Eliminated:</strong> ${
      data.eliminatedUUID ? getPlayerNameByUUID(data.eliminatedUUID) : "Tie"
    }</p>
  `;
});

/* ---------- ACTIONS ---------- */

function startRound() {
  socket.emit("update_settings", {
    showRole: showRole.checked,
    showCategory: showCategory.checked,
    imposterMode: imposterMode.value
  });
  socket.emit("update_word_data", { wordDataText: wordData.value });
  socket.emit("start_round");
}

function openVoting() {
  socket.emit("open_voting");
}

function submitVote() {
  if (voteSubmitted) return;
  voteSubmitted = true;

  socket.emit("cast_vote", { targetUUID: voteSelect.value });

  submitVoteBtn.disabled = true;
  voteSelect.disabled = true;
  submitVoteBtn.textContent = "Vote Submitted";

  voteStatus.textContent = "Vote submitted. Waiting for others...";
  voteStatus.classList.remove("hidden");
}

function forceEndVoting() {
  socket.emit("force_end_voting");
}
