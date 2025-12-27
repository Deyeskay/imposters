import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

/* -------------------- GAME STATE -------------------- */

const rooms = {};

function createRoom(roomId) {
  rooms[roomId] = {
    roomId,
    hostId: null, // playerUUID
    players: {},  // playerUUID -> player
    phase: "LOBBY",
    settings: {
      showRole: false,
      showCategory: true,
      imposterMode: "NO_WORD"
    },
    wordData: getDefaultWordData(),
    currentRound: null
  };
}

function getDefaultWordData() {
  return {
    Fruits: [
      "Apple","Banana","Orange","Mango","Pineapple","Strawberry","Blueberry",
      "Grapes","Watermelon","Peach","Pear","Cherry","Kiwi","Papaya","Lemon",
      "Lime","Coconut","Pomegranate","Raspberry","Blackberry"
    ],
    Jobs: [
      "Doctor","Nurse","Teacher","Professor","Engineer","Developer","Designer",
      "Artist","Musician","Chef","Baker","Pilot","Flight Attendant","Plumber",
      "Electrician","Carpenter","Mechanic","Accountant","Lawyer","Paralegal"
    ],
    Animals: [
      "Dog","Cat","Lion","Tiger","Elephant","Giraffe","Zebra","Horse","Cow",
      "Sheep","Goat","Pig","Monkey","Gorilla","Kangaroo","Koala","Panda",
      "Bear","Wolf","Fox"
    ],
    Sports: [
      "Soccer","Basketball","Baseball","Football","Hockey","Tennis","Badminton",
      "Volleyball","Cricket","Rugby","Golf","Boxing","Wrestling","Swimming",
      "Surfing","Skateboarding","Snowboarding","Cycling","Running",
      "Track and Field"
    ],
    Foods: [
      "Pizza","Burger","Sandwich","Tacos","Burrito","Sushi","Ramen","Pasta",
      "Spaghetti","Lasagna","Fried Rice","Noodles","Salad","Soup","Stew",
      "Curry","Dumplings","Pancakes","Waffles","Omelet"
    ],
    Countries: [
      "United States","Canada","Mexico","Brazil","Argentina","United Kingdom",
      "France","Germany","Italy","Spain","Portugal","Netherlands","Belgium",
      "Switzerland","Sweden","Norway","Denmark","Finland","Poland","Greece"
    ],
    "Tech Gadgets": [
      "Smartphone","Tablet","Laptop","Desktop Computer","Smartwatch",
      "Fitness Tracker","Wireless Earbuds","Bluetooth Speaker","Game Console",
      "VR Headset","Drone","Action Camera","Webcam","Microphone",
      "Mechanical Keyboard","Gaming Mouse","Router","Modem","Power Bank",
      "USB Drive"
    ],
    "Apps and Platforms": [
      "YouTube","Netflix","Spotify","TikTok","Instagram","Snapchat","Discord",
      "WhatsApp","Telegram","Reddit","Twitch","Zoom","Google Maps","Gmail",
      "Chrome Browser","Apple Music","SoundCloud","Pinterest","Canva","Notion"
    ],
    "Music Genres": [
      "Pop","Rock","Hip Hop","R&B","Jazz","Blues","Classical","Electronic",
      "EDM","House","Techno","Trance","Dubstep","Country","Folk","Indie",
      "Alternative","Metal","Punk","Reggae"
    ],
    Vehicles: [
      "Car","Sedan","SUV","Hatchback","Coupe","Convertible","Pickup Truck",
      "Van","Minivan","Bus","Coach Bus","Motorcycle","Scooter","Bicycle",
      "Electric Bike","Skateboard","Longboard","Train","Subway","Tram"
    ],
    "Household Items": [
      "Chair","Table","Sofa","Couch","Bed","Mattress","Pillow","Blanket","Lamp",
      "Light Bulb","Bookshelf","Cabinet","Drawer","Wardrobe","Mirror","Clock",
      "Rug","Carpet","Curtains","Door Mat"
    ],
    Superheroes: [
      "Superman","Batman","Spider-Man","Iron Man","Captain America","Thor",
      "Hulk","Black Widow","Hawkeye","Wonder Woman","Flash","Aquaman",
      "Doctor Strange","Black Panther","Ant-Man","Wasp","Deadpool",
      "Wolverine","Professor X","Vision"
    ]
  };
}


/* -------------------- HELPERS -------------------- */

function findRoomBySocket(socketId) {
  return Object.values(rooms).find(room =>
    Object.values(room.players).some(p => p.socketId === socketId)
  );
}

function findUUIDBySocket(room, socketId) {
  return Object.keys(room.players).find(
    uuid => room.players[uuid].socketId === socketId
  );
}

function broadcastRoomState(room) {
  io.to(room.roomId).emit("room_state", {
    roomId: room.roomId,
    hostId: room.hostId,
    phase: room.phase,
    settings: room.settings,
    players: Object.values(room.players).map(p => ({
      uuid: p.uuid,
      name: p.name,
      score: p.score,
      isHost: p.uuid === room.hostId,
	  connected: p.socketId !== null,
	  hasVoted:
		room.phase === "VOTING"
		? Boolean(room.currentRound?.votes?.[p.uuid])
		: false
    }))
  });
}

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* -------------------- SOCKET EVENTS -------------------- */

io.on("connection", socket => {

  /* JOIN ROOM (UUID AWARE) */
  socket.on("join_room", ({ roomId, playerName, playerUUID }) => {
    if (!rooms[roomId]) createRoom(roomId);
    const room = rooms[roomId];

    socket.join(roomId);

    // Reconnect
    if (room.players[playerUUID]) {
	  room.players[playerUUID].socketId = socket.id;

	  // 🔁 REPLAY PRIVATE REVEAL IF MID-ROUND
	  if (room.phase === "REVEAL" && room.players[playerUUID].privateReveal) {
		io.to(socket.id).emit(
		  "private_reveal",
		  room.players[playerUUID].privateReveal
		);
	  }
	}
    // New player
    else {
      room.players[playerUUID] = {
        uuid: playerUUID,
        socketId: socket.id,
        name: playerName,
        score: 0
      };

      if (!room.hostId) room.hostId = playerUUID;
    }

    broadcastRoomState(room);
  });

  /* UPDATE SETTINGS (HOST ONLY) */
  socket.on("update_settings", settings => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;

    const uuid = findUUIDBySocket(room, socket.id);
    if (uuid !== room.hostId || room.phase !== "LOBBY") return;

    room.settings = settings;
    broadcastRoomState(room);
  });

  /* UPDATE WORD DATA (HOST ONLY) */
  socket.on("update_word_data", ({ wordDataText }) => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;

    const uuid = findUUIDBySocket(room, socket.id);
    if (uuid !== room.hostId) return;

    try {
      room.wordData = JSON.parse(wordDataText);
    } catch {}
  });

  /* START ROUND (HOST ONLY) */
  socket.on("start_round", () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;

    const uuid = findUUIDBySocket(room, socket.id);
    if (uuid !== room.hostId) return;

    const playerUUIDs = Object.keys(room.players);
    if (playerUUIDs.length < 3) return;

    const category = getRandomItem(Object.keys(room.wordData));
    const words = room.wordData[category];
    const mainWord = getRandomItem(words);
    const imposterUUID = getRandomItem(playerUUIDs);

    let imposterWord = "???";
    if (room.settings.imposterMode === "DIFFERENT_WORD") {
      imposterWord = getRandomItem(words.filter(w => w !== mainWord));
    }

    room.phase = "REVEAL";
    room.currentRound = {
      category,
      mainWord,
      imposterWord,
      imposterUUID,
      votes: {}
    };

    Object.values(room.players).forEach(p => {
      const isImposter = p.uuid === imposterUUID;
	  
	  p.privateReveal = {
	  showRole: room.settings.showRole,
	  showCategory: room.settings.showCategory,
	  category,
	  role: isImposter ? "IMPOSTER" : "CREWMATE",
	  word: isImposter ? imposterWord : mainWord
	};
	  
      io.to(p.socketId).emit("private_reveal", {
        showRole: room.settings.showRole,
        showCategory: room.settings.showCategory,
        category,
        role: isImposter ? "IMPOSTER" : "CREWMATE",
        word: isImposter ? imposterWord : mainWord
      });
    });

    broadcastRoomState(room);
  });

  /* OPEN VOTING (HOST ONLY) */
  socket.on("open_voting", () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;

    const uuid = findUUIDBySocket(room, socket.id);
    if (uuid !== room.hostId) return;

    room.phase = "VOTING";
    broadcastRoomState(room);
  });

  /* CAST VOTE */
  socket.on("cast_vote", ({ targetUUID }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== "VOTING") return;

    const voterUUID = findUUIDBySocket(room, socket.id);
    if (!voterUUID) return;

    if (room.currentRound.votes[voterUUID]) return;

    room.currentRound.votes[voterUUID] = targetUUID;

	// 🔁 UPDATE VOTE PROGRESS FOR ALL PLAYERS
	broadcastRoomState(room);

	// Auto-end if all CONNECTED players voted
	const connectedPlayers = Object.values(room.players).filter(
	  p => p.socketId !== null
	);

	if (
	  Object.keys(room.currentRound.votes).length === connectedPlayers.length
	) {
	  revealResults(room);
	}
  });
  
   /* FORCE STOP VOTE */
  socket.on("force_end_voting", () => {
  const room = findRoomBySocket(socket.id);
  if (!room || room.phase !== "VOTING") return;

  const uuid = findUUIDBySocket(room, socket.id);
  if (uuid !== room.hostId) return;

  // End voting immediately with current votes
  revealResults(room);
});


  function revealResults(room) {
    const voteCounts = {};
    Object.values(room.currentRound.votes).forEach(uuid => {
      voteCounts[uuid] = (voteCounts[uuid] || 0) + 1;
    });

    let maxVotes = -1;
    let eliminatedUUID = null;
    let topCount = 0;

    for (const uuid in voteCounts) {
      if (voteCounts[uuid] > maxVotes) {
        maxVotes = voteCounts[uuid];
        eliminatedUUID = uuid;
        topCount = 1;
      } else if (voteCounts[uuid] === maxVotes) {
        topCount++;
      }
    }

    const isTie = topCount > 1;
    const imposterUUID = room.currentRound.imposterUUID;

    if (!isTie && eliminatedUUID === imposterUUID) {
      Object.values(room.players).forEach(p => {
        if (p.uuid !== imposterUUID) p.score += 1;
      });
    } else {
      room.players[imposterUUID].score += 2;
    }

    room.phase = "RESULTS";
	
	// 🧹 CLEAR PRIVATE REVEAL DATA AFTER ROUND
	Object.values(room.players).forEach(p => {
	  delete p.privateReveal;
	});


    io.to(room.roomId).emit("round_results", {
      imposterUUID,
      eliminatedUUID: isTie ? null : eliminatedUUID
    });

    broadcastRoomState(room);
  }

  /* DISCONNECT (SOFT) */
	socket.on("disconnect", () => {
	  const room = findRoomBySocket(socket.id);
	  if (!room) return;

	  const uuid = findUUIDBySocket(room, socket.id);
	  if (!uuid) return;

	  // Mark player as disconnected
	  room.players[uuid].socketId = null;

	  // Reassign host if needed
	  if (room.hostId === uuid) {
		const next = Object.values(room.players).find(p => p.socketId);
		room.hostId = next ? next.uuid : null;
	  }

	  // 🧹 REMOVE ROOM IF EMPTY
	  const hasAnyConnectedPlayer = Object.values(room.players).some(
		p => p.socketId !== null
	  );

	  if (!hasAnyConnectedPlayer) {
		delete rooms[room.roomId];
		return;
	  }

	  broadcastRoomState(room);
	});

});

/* -------------------- START SERVER -------------------- */

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
