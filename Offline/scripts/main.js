document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let gameState = {
        players: {}, // { peerId: { name, teamId } }
        teams: {
            'team-1': { name: "קבוצה א'", score: 0, playerIds: [] },
            'team-2': { name: "קבוצה ב'", score: 0, playerIds: [] }
        },
        settings: {
            winningScore: 20,
            roundTime: 60,
        },
        currentTurn: {
            teamId: null,
            playerId: null,
            playerIndex: -1, // index within the team's playerIds array
            word: '',
            turnScore: 0,
        },
        gameStarted: false,
        gameActive: false, // Is the timer running?
        availableWords: [],
    };

    // --- DOM ELEMENTS ---
    const screens = {
        landing: document.getElementById('landing-screen'),
        setup: document.getElementById('setup-screen'),
        join: document.getElementById('join-screen'),
        lobby: document.getElementById('lobby-screen'),
        gameHost: document.getElementById('game-screen-host'),
        gamePeer: document.getElementById('game-screen-peer'),
    };

    // Landing
    const createSessionBtn = document.getElementById('create-session-btn');
    const joinSessionBtn = document.getElementById('join-session-btn');

    // Setup
    const playerNameInput = document.getElementById('player-name-input');
    const scoreOptions = document.getElementById('score-options');
    const goToLobbyBtn = document.getElementById('go-to-lobby-btn');

    // Join
    const peerNameInput = document.getElementById('peer-name-input');

    // Lobby
    const unassignedPlayersContainer = document.getElementById('unassigned-players');
    const teamsContainer = document.getElementById('teams-container');
    const startGameBtn = document.getElementById('start-game-btn');

    // Game Host
    const scoresContainer = document.getElementById('scores-container');
    const timerDisplay = document.getElementById('timer');
    const hostWordCard = document.getElementById('word-card');
    const hostWordDisplay = document.getElementById('word-display-host');
    const currentPlayerName = document.getElementById('current-player-name');
    const currentTeamName = document.getElementById('current-team-name');

    // Game Peer
    const peerWordCard = document.getElementById('peer-word-card');
    const peerWordDisplay = document.getElementById('word-display-peer');
    const peerActionButtons = document.getElementById('peer-action-buttons');
    const correctBtn = document.getElementById('correct-btn');
    const skipBtn = document.getElementById('skip-btn');
    const peerWaitingView = document.getElementById('peer-waiting-view');
    const peerMyTurnView = document.getElementById('peer-my-turn-view');
    const peerCurrentPlayerName = document.getElementById('peer-current-player-name');

    // Modals
    const turnOverModal = document.getElementById('turn-over-modal');
    const finishedPlayerName = document.getElementById('finished-player-name');
    const turnScoreDisplay = document.getElementById('turn-score');
    const nextTurnBtn = document.getElementById('next-turn-btn');
    const winningScreen = document.getElementById('winning-screen');
    const winningTeamName = document.getElementById('winning-team-name');
    const playAgainBtn = document.getElementById('play-again-btn');

    let timerInterval = null;
    let draggedPlayerId = null;

    const defaultWords = ["שולחן", "כסא", "מחשב", "טלפון", "אהבה", "לרוץ", "שמח", "מכונית", "כלב", "חתול", "שמש", "ירח", "ספר", "בית ספר", "ים", "חופש", "אוכל", "ארנק", "משקפיים", "עגבניה", "מלפפון", "ענן", "גשם", "מטריה", "כדורגל", "כדורסל", "מטוס", "רכבת", "אופניים", "מוזיקה", "גיטרה", "פסנתר", "יום הולדת", "מתנה", "בלון", "עוגה", "חתונה", "תינוק", "משפחה", "חברים", "עבודה", "כסף", "בנק", "קניון", "חנות", "בגד ים", "מגבת", "כובע", "נעליים", "גרביים", "חולצה", "מכנסיים", "שמלה", "טלוויזיה", "סרט", "חדשות", "אינטרנט", "מקלדת", "עכבר", "מדפסת", "וילון", "חלון", "דלת", "מפתח", "מיטה", "שמיכה", "כרית", "ארון", "מנורה", "מראה", "מברשת שיניים", "סבון", "שמפו", "מלחמה", "שלום", "צבא", "חייל", "מדינה", "דגל", "תקווה", "חלום", "כעס", "פחד", "בדיחה", "צחוק", "דמעה", "חיוך", "לב", "מוח", "יד", "רגל", "אף", "אוזן", "פה", "עין", "שיער", "ציפורן", "אצבע", "קיץ", "חורף", "אביב", "סתיו", "פרח", "עץ", "דשא", "נהר", "הר", "מדבר", "ג'ונגל"];


    // --- UI LOGIC ---

    function switchScreen(screenName) {
        Object.values(screens).forEach(screen => screen.classList.add('hidden'));
        if (screens[screenName]) {
            screens[screenName].classList.remove('hidden');
        }
    }

    function renderLobby() {
        unassignedPlayersContainer.innerHTML = `<h4 class="font-semibold text-gray-700 mb-2">שחקנים שמחכים</h4>`;

        Object.values(gameState.teams).forEach(team => {
            const teamEl = document.getElementById(team.id);
            if (teamEl) {
                while (teamEl.children.length > 1) {
                    teamEl.removeChild(teamEl.lastChild);
                }
            }
        });

        Object.entries(gameState.players).forEach(([id, player]) => {
            const playerEl = document.createElement('div');
            playerEl.id = `player-${id}`;
            playerEl.className = 'p-2 bg-blue-100 rounded shadow-sm draggable';
            playerEl.textContent = player.name;
            playerEl.draggable = true;

            if (player.teamId && gameState.teams[player.teamId]) {
                document.querySelector(`#${player.teamId}`).appendChild(playerEl);
            } else {
                unassignedPlayersContainer.appendChild(playerEl);
            }
        });
    }

    function renderScoreboard() {
        scoresContainer.innerHTML = '';
        Object.entries(gameState.teams).forEach(([id, team]) => {
            if (team.playerIds.length === 0) return;
            const scoreBox = document.createElement('div');
            scoreBox.id = `score-box-${id}`;
            scoreBox.className = 'score-box p-3 rounded-lg text-center shadow-md';
            scoreBox.innerHTML = `
                <div id="team-name-${id}" class="font-bold text-base md:text-lg truncate">${team.name}</div>
                <div id="team-score-${id}" class="text-2xl font-black">${team.score}</div>
            `;
            scoresContainer.appendChild(scoreBox);
        });
    }

    function updateHostGameScreen() {
        const { teamId, playerId } = gameState.currentTurn;
        if (!teamId || !playerId) return;

        const team = gameState.teams[teamId];
        const player = gameState.players[playerId];

        currentPlayerName.textContent = player.name;
        currentTeamName.textContent = team.name;
        hostWordDisplay.textContent = gameState.currentTurn.word;

        document.querySelectorAll('.score-box').forEach(box => box.classList.remove('active'));
        const currentScoreBox = document.getElementById(`score-box-${teamId}`);
        if (currentScoreBox) {
            currentScoreBox.classList.add('active');
        }
    }

    function updatePeerGameScreen() {
        const myId = window.network.getPeerId();
        const { playerId, teamId } = gameState.currentTurn;
        const isMyTurn = myId === playerId;

        if (isMyTurn) {
            peerWaitingView.classList.add('hidden');
            peerMyTurnView.classList.remove('hidden');
            peerWordCard.classList.remove('is-flipped');
            peerActionButtons.classList.add('hidden');
        } else {
            peerWaitingView.classList.remove('hidden');
            peerMyTurnView.classList.add('hidden');
            peerActionButtons.classList.add('hidden');
            peerWordCard.classList.remove('is-flipped');
            const currentPlayer = gameState.players[playerId];
            if (currentPlayer) {
                peerCurrentPlayerName.textContent = currentPlayer.name;
            }
        }
    }

    function startTimer() {
        gameState.gameActive = true;
        let timeLeft = gameState.settings.roundTime;
        timerDisplay.textContent = timeLeft;

        timerInterval = setInterval(() => {
            timeLeft--;
            timerDisplay.textContent = timeLeft;
            if (timeLeft <= 0) {
                endTurn();
            }
        }, 1000);
    }

    // --- GAME LOGIC (HOST) ---
    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function getNextWord() {
        if (gameState.availableWords.length === 0) {
            gameState.availableWords = [...defaultWords];
            shuffle(gameState.availableWords);
        }
        return gameState.availableWords.pop();
    }

    function setupNextTurn() {
        const teamIdsWithPlayers = Object.keys(gameState.teams).filter(id => gameState.teams[id].playerIds.length > 0);
        if (teamIdsWithPlayers.length === 0) return;

        let currentTeamIndex = teamIdsWithPlayers.indexOf(gameState.currentTurn.teamId);
        let nextTeamIndex = (currentTeamIndex + 1) % teamIdsWithPlayers.length;
        const nextTeamId = teamIdsWithPlayers[nextTeamIndex];
        const nextTeam = gameState.teams[nextTeamId];

        gameState.currentTurn.playerIndex = (nextTeamId === gameState.currentTurn.teamId)
            ? (gameState.currentTurn.playerIndex + 1) % nextTeam.playerIds.length
            : 0;

        gameState.currentTurn.teamId = nextTeamId;
        gameState.currentTurn.playerId = nextTeam.playerIds[gameState.currentTurn.playerIndex];
        gameState.currentTurn.word = '';
        gameState.currentTurn.turnScore = 0;

        window.network.broadcast(gameState);
    }

    function handlePlayerAction(action) {
        const team = gameState.teams[gameState.currentTurn.teamId];
        if (action === 'correct') {
            team.score++;
            gameState.currentTurn.turnScore++;
        } else if (action === 'skip') {
            if (team.score > 0) team.score--;
        }

        const winner = Object.values(gameState.teams).find(t => t.score >= gameState.settings.winningScore);
        if (winner) {
            endGame(winner);
            return;
        }

        gameState.currentTurn.word = getNextWord();
        window.network.broadcast(gameState);
    }

    function endTurn() {
        clearInterval(timerInterval);
        gameState.gameActive = false;

        const player = gameState.players[gameState.currentTurn.playerId];
        finishedPlayerName.textContent = player.name;
        turnScoreDisplay.textContent = gameState.currentTurn.turnScore;
        turnOverModal.classList.remove('hidden');

        // Host clicks next turn
        nextTurnBtn.onclick = () => {
            turnOverModal.classList.add('hidden');
            setupNextTurn();
        };

        window.network.broadcast({ type: 'TURN_END', turnScore: gameState.currentTurn.turnScore, playerName: player.name });
    }

    function endGame(winningTeam) {
        gameState.gameStarted = false;
        gameState.gameActive = false;
        clearInterval(timerInterval);
        winningTeamName.textContent = winningTeam.name;
        winningScreen.classList.remove('hidden');
        window.network.broadcast({ type: 'GAME_END', winningTeamName: winningTeam.name });
    }

    // --- EVENT HANDLERS ---
    createSessionBtn.onclick = () => {
        window.isHost = true;
        switchScreen('setup');
    };

    joinSessionBtn.onclick = () => {
        window.isHost = false;
        switchScreen('join');
        window.network.startPeer();
    };

    goToLobbyBtn.onclick = () => {
        gameState.players[0] = { name: playerNameInput.value || 'המארח', teamId: null };
        gameState.settings.winningScore = parseInt(scoreOptions.querySelector('.selected').dataset.value);
        switchScreen('lobby');
        window.network.startHost();
    };

    startGameBtn.onclick = () => {
        if (Object.values(gameState.players).some(p => !p.teamId)) {
            alert('יש לשייך את כל השחקנים לקבוצות!');
            return;
        }

        // Populate playerIds in teams
        Object.values(gameState.teams).forEach(t => t.playerIds = []);
        Object.entries(gameState.players).forEach(([id, p]) => {
            if (p.teamId) gameState.teams[p.teamId].playerIds.push(id);
        });

        gameState.gameStarted = true;
        gameState.availableWords = [...defaultWords];
        shuffle(gameState.availableWords);

        const firstTeamId = Object.keys(gameState.teams).find(id => gameState.teams[id].playerIds.length > 0);
        if (!firstTeamId) {
            alert('צריך לפחות שחקן אחד בקבוצה כדי להתחיל');
            return;
        }

        gameState.currentTurn = {
            teamId: firstTeamId,
            playerId: gameState.teams[firstTeamId].playerIds[0],
            playerIndex: 0,
            word: '',
            turnScore: 0,
        };

        window.network.broadcast(gameState);
    };

    // Peer handlers
    peerWordCard.addEventListener('click', () => {
        const myId = window.network.getPeerId();
        if (myId !== gameState.currentTurn.playerId || gameState.gameActive) return;

        peerWordCard.classList.add('is-flipped');
        peerActionButtons.classList.remove('hidden');
        window.network.sendToHost({ type: 'TURN_START' });
    });

    correctBtn.addEventListener('click', () => window.network.sendToHost({ type: 'ACTION', payload: 'correct' }));
    skipBtn.addEventListener('click', () => window.network.sendToHost({ type: 'ACTION', payload: 'skip' }));

    playAgainBtn.onclick = () => {
        // This should probably take players back to the lobby
        location.reload();
    };

    // Drag and Drop
    teamsContainer.addEventListener('dragstart', e => {
        if (e.target.classList.contains('draggable')) {
            draggedPlayerId = e.target.id.split('-')[1];
            e.target.classList.add('dragging');
        }
    });

    teamsContainer.addEventListener('dragend', e => {
        if (e.target.classList.contains('draggable')) {
            e.target.classList.remove('dragging');
            draggedPlayerId = null;
        }
    });

    document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.addEventListener('dragover', e => e.preventDefault());
        zone.addEventListener('drop', e => {
            e.preventDefault();
            if (!draggedPlayerId) return;

            const player = gameState.players[draggedPlayerId];
            const newTeamId = (zone.id === 'unassigned-players') ? null : zone.id;

            player.teamId = newTeamId;
            renderLobby();
        });
    });


    // --- NETWORK MESSAGE HANDLING ---

    window.handleNetworkData = (data, peerId) => {
        // Peer receives initial connection data or game state update from host
        if (!window.isHost) {
            if (data.type === 'GAME_STATE_UPDATE') {
                gameState = data.payload;

                if (gameState.gameStarted && screens.gamePeer.classList.contains('hidden')) {
                    switchScreen('gamePeer');
                    renderScoreboard(); // You'll need to add a scores container to the peer screen or show it in a modal
                }

                if (gameState.gameStarted) {
                    updatePeerGameScreen();
                    renderScoreboard();
                }

            } else if (data.type === 'GAME_END') {
                winningTeamName.textContent = data.winningTeamName;
                winningScreen.classList.remove('hidden');
            } else if (data.type === 'TURN_END') {
                finishedPlayerName.textContent = data.playerName;
                turnScoreDisplay.textContent = data.turnScore;
                turnOverModal.classList.remove('hidden');
                nextTurnBtn.onclick = () => turnOverModal.classList.add('hidden'); // Peer just closes modal
            }
            return;
        }

        // Host receives messages from peers
        if (data.type === 'JOIN_REQUEST') {
            gameState.players[peerId] = { name: data.name, teamId: null };
            renderLobby();
            window.network.sendToPeer(peerId, { type: 'GAME_STATE_UPDATE', payload: gameState });
        } else if (data.type === 'TURN_START') {
            if (!gameState.gameActive) {
                gameState.currentTurn.word = getNextWord();
                startTimer();
                window.network.broadcast(gameState);
            }
        } else if (data.type === 'ACTION') {
            if (gameState.gameActive && peerId === gameState.currentTurn.playerId) {
                handlePlayerAction(data.payload);
            }
        }
    };

    window.handleNewConnection = (peerId) => {
        if (window.isHost) {
            console.log(`New player connected: ${peerId}`);
            // Player info will be sent in JOIN_REQUEST
        }
    };

    window.updateGameState = (newState) => {
        if (window.isHost) return; // Only host updates state
        gameState = newState;

        if (!gameState.gameStarted) {
            if (screens.lobby.classList.contains('hidden')) switchScreen('lobby');
            renderLobby();
        } else {
            if (screens.gameHost.classList.contains('hidden')) switchScreen('gameHost');
            renderScoreboard();
            updateHostGameScreen();
        }
    };

    window.getPeerName = () => peerNameInput.value || `שחקן ${Math.floor(Math.random() * 1000)}`;

    // --- INIT ---
    switchScreen('landing');
});
