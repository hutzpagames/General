// --- DOM Elements ---
const views = document.querySelectorAll('.view');
const createGameBtn = document.getElementById('create-game-btn');
const joinGameBtn = document.getElementById('join-game-btn');
const startGameBtn = document.getElementById('start-game-btn');
const cancelJoinBtn = document.getElementById('cancel-join-btn');

// --- State Variables ---
let peer;
let myPeerId;
let hostId;
let qrCodeScanner;
const connections = new Map(); // Use a Map to store connections with peer IDs as keys

// --- UI Management ---
function showView(viewId) {
    views.forEach(view => {
        view.classList.toggle('active', view.id === viewId);
    });
}

// --- Event Listeners ---
createGameBtn.addEventListener('click', createGame);
joinGameBtn.addEventListener('click', joinGame);
cancelJoinBtn.addEventListener('click', () => {
    if (qrCodeScanner) {
        qrCodeScanner.stop().catch(err => console.error("Failed to stop scanner", err));
    }
    showView('initial-view');
});
startGameBtn.addEventListener('click', startGame);

// --- Host Logic ---
function createGame() {
    showView('host-view');
    peer = new Peer(); // Let PeerJS server assign a random ID

    peer.on('open', (id) => {
        myPeerId = id;
        hostId = id; // The creator is the host
        document.getElementById('game-id').innerText = id;

        // Generate the QR code
        new QRCode(document.getElementById("qr-code"), {
            text: id,
            width: 200,
            height: 200,
        });
    });

    peer.on('connection', (conn) => {
        console.log(`Incoming connection from ${conn.peer}`);
        connections.set(conn.peer, conn);
        updatePlayerList();

        conn.on('data', (data) => handlePlayerData(conn.peer, data));
        conn.on('close', () => {
            console.log(`Connection closed from ${conn.peer}`);
            connections.delete(conn.peer);
            updatePlayerList();
        });
    });
}

function updatePlayerList() {
    const playerList = document.getElementById('player-list');
    playerList.innerHTML = '';
    if (connections.size === 0) {
        playerList.innerHTML = '<li>No players yet...</li>';
        return;
    }
    for (const [peerId] of connections) {
        const li = document.createElement('li');
        li.textContent = peerId;
        playerList.appendChild(li);
    }
}

function handlePlayerData(peerId, data) {
    console.log(`Data from ${peerId}:`, data);
    // You can handle player actions here, e.g., player ready, played card, etc.
}

function startGame() {
    // A simple deck of cards for demonstration
    const deck = ['Ace ♠️', 'King ♥️', 'Queen ♦️', 'Jack ♣️', '10 ♠️', '9 ♥️', '8 ♦️', '7 ♣️'];
    deck.sort(() => Math.random() - 0.5); // Shuffle the deck

    // Tell everyone (including host) to switch to the game view
    broadcastMessage({ type: 'startGame' });
    showView('game-view');
    document.getElementById('player-name').innerText = 'Host';
    document.getElementById('game-status').innerText = 'Game in progress!';

    // Deal cards to each player
    let playerIndex = 0;
    for (const [peerId, conn] of connections) {
        const playerCards = [deck.pop(), deck.pop()];
        conn.send({ type: 'dealCards', cards: playerCards, name: `Player ${playerIndex + 1}` });
        playerIndex++;
    }

    // Deal cards to the host
    const hostCards = [deck.pop(), deck.pop()];
    document.getElementById('my-cards').innerText = hostCards.join(' | ');
}

function broadcastMessage(message) {
    for (const conn of connections.values()) {
        conn.send(message);
    }
}

// --- Player (Joiner) Logic ---
function joinGame() {
    showView('join-view');
    qrCodeScanner = new Html5Qrcode("reader");

    const onScanSuccess = (decodedText) => {
        console.log(`QR Code detected: ${decodedText}`);
        hostId = decodedText;
        qrCodeScanner.stop().then(() => {
            connectToHost();
        }).catch(err => console.error("Failed to stop scanner", err));
    };

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    qrCodeScanner.start({ facingMode: "environment" }, config, onScanSuccess)
        .catch(err => console.error("Unable to start scanning", err));
}

function connectToHost() {
    showView('game-view');
    document.getElementById('game-status').innerText = `Connecting to host ${hostId}...`;

    peer = new Peer(); // Player gets their own ID
    peer.on('open', (id) => {
        myPeerId = id;
        console.log(`My peer ID is ${id}, connecting to host ${hostId}`);

        const conn = peer.connect(hostId);

        conn.on('open', () => {
            console.log('Connection to host established!');
            document.getElementById('game-status').innerText = 'Connected! Waiting for game to start.';
            connections.set(hostId, conn); // Player stores connection to host
        });

        conn.on('data', (data) => {
            console.log('Data from host:', data);
            if (data.type === 'startGame') {
                showView('game-view');
                document.getElementById('game-status').innerText = 'Game in progress!';
            } else if (data.type === 'dealCards') {
                document.getElementById('my-cards').innerText = data.cards.join(' | ');
                document.getElementById('player-name').innerText = data.name;
            }
        });

        conn.on('close', () => {
            alert('Connection to host lost.');
            showView('initial-view');
        });
    });
}

// --- Initial Load ---
window.onload = () => {
    showView('initial-view');
};