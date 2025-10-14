(function () {
    let peerId = `p_${Math.random().toString(36).substr(2, 9)}`;
    let localConnection;
    let connections = {}; // For host: { peerId: RTCPeerConnection }
    let dataChannels = {}; // For host: { peerId: RTCDataChannel }
    let html5QrCode;

    const config = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    function getPeerId() {
        return peerId;
    }

    // --- HOST LOGIC ---

    async function startHost() {
        console.log("Starting as host...");
        const hostQrCodeContainer = document.getElementById('host-qr-code');

        localConnection = new RTCPeerConnection(config);

        localConnection.onicecandidate = e => {
            if (e.candidate) {
                // Candidates will be included in the offer
            } else {
                console.log("ICE Gathering complete. Offer is ready.");
                const offer = localConnection.localDescription;
                hostQrCodeContainer.innerHTML = '';
                new QRCode(hostQrCodeContainer, {
                    text: JSON.stringify(offer),
                    width: 256,
                    height: 256,
                });

                // Show scanner for peer's answer
                document.getElementById('host-scan-answer-container').classList.remove('hidden');
                startHostQrScanner();
            }
        };

        // We don't need a data channel on the host's main connection
        // We'll create one for each connecting peer

        const offer = await localConnection.createOffer();
        await localConnection.setLocalDescription(offer);
    }

    function startHostQrScanner() {
        const scannerElement = document.getElementById('host-qr-scanner');
        html5QrCode = new Html5Qrcode("host-qr-scanner");
        html5QrCode.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            async (decodedText) => {
                console.log("Host scanned an answer QR code.");
                html5QrCode.stop();
                document.getElementById('host-scan-answer-container').classList.add('hidden');

                try {
                    const answer = JSON.parse(decodedText);
                    const peerId = answer.peerId;

                    if (!peerId) {
                        console.error("Answer from peer is missing a peerId");
                        return;
                    }

                    console.log(`Setting remote description for peer: ${peerId}`);
                    await localConnection.setRemoteDescription(new RTCSessionDescription(answer.sdp));
                    // The connection is now established!
                    // We need a way to create a dedicated channel for this peer.
                    // Let's modify the flow. The host doesn't have one 'localConnection'.
                    // The host has a connection for EACH peer.
                    // The QR code will just be a "session ID". The rest will happen over a signaling server.
                    // BUT user wants no server.

                    // --- Let's retry the logic. Sticking to QR codes ---
                    // The host's QR is the offer. When a peer connects, they send an answer.
                    // How does the host know WHICH peer sent the answer? The answer needs the peer's ID.
                    // And the host needs to manage multiple connections.

                    // Okay, new approach for host:
                    // Host has NO RTCPeerConnection initially.
                    // It just displays a QR code with a unique "Session ID".
                    // A peer scans this, and generates an OFFER, and shows that as a QR.
                    // The host then scans the peer's OFFER, creates a connection, generates an ANSWER, and shows THAT as a QR.
                    // The peer scans the host's answer.
                    // This is too much back and forth.

                    // --- Final, simpler QR approach ---
                    // The original idea was better. Host creates an offer. Peer creates an answer.
                    // The hard part is managing multiple peers for the host.

                    // Let's create a NEW connection for each peer on the host side.
                    const newPeerId = answer.peerId;
                    console.log(`Processing answer from ${newPeerId}`);

                    const peerConnection = new RTCPeerConnection(config);
                    connections[newPeerId] = peerConnection;

                    peerConnection.ondatachannel = (event) => {
                        console.log(`Data channel received from ${newPeerId}`);
                        const channel = event.channel;
                        dataChannels[newPeerId] = channel;
                        channel.onmessage = (e) => window.handleNetworkData(JSON.parse(e.data), newPeerId);
                        channel.onopen = () => window.handleNewConnection(newPeerId);
                    };

                    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer.sdp));
                    const hostAnswer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(hostAnswer);

                    // How to send this answer back to the peer?
                    // This is the core problem. Without a signaling server, this is hard.
                    // Let's display the host's final QR code that the peer needs to scan.
                    const hostAnswerPayload = { sdp: peerConnection.localDescription };
                    const hostQrCodeContainer = document.getElementById('host-qr-code');
                    hostQrCodeContainer.innerHTML = '';
                    new QRCode(hostQrCodeContainer, {
                        text: JSON.stringify(hostAnswerPayload),
                        width: 256,
                        height: 256,
                    });
                    document.getElementById('host-qr-code').previousElementSibling.textContent = "3. שחקן, סרוק את הקוד הסופי";

                    // The host now needs to be able to scan another player...
                    // So we restart the scanner.
                    setTimeout(() => {
                        document.getElementById('host-scan-answer-container').classList.remove('hidden');
                        startHostQrScanner();
                    }, 3000);


                } catch (error) {
                    console.error("Error processing peer answer:", error);
                    setTimeout(() => {
                        document.getElementById('host-scan-answer-container').classList.remove('hidden');
                        startHostQrScanner();
                    }, 1000);
                }
            }
        ).catch(err => {
            console.error("QR Scanner error:", err);
        });
    }


    // --- PEER LOGIC ---

    async function startPeer() {
        console.log("Starting as peer...");
        const scannerElement = document.getElementById('qr-scanner');
        html5QrCode = new Html5Qrcode("qr-scanner");
        html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
                console.log("Peer scanned host offer.");
                await html5QrCode.stop();
                scannerElement.classList.add('hidden');

                try {
                    const offer = JSON.parse(decodedText);
                    localConnection = new RTCPeerConnection(config);

                    localConnection.onicecandidate = e => {
                        if (!e.candidate) {
                            console.log("Peer ICE gathering complete.");
                            const answerPayload = {
                                peerId: peerId,
                                sdp: localConnection.localDescription
                            };

                            document.getElementById('peer-qr-code-container').classList.remove('hidden');
                            const peerQrCodeContainer = document.getElementById('peer-qr-code');
                            peerQrCodeContainer.innerHTML = '';
                            new QRCode(peerQrCodeContainer, {
                                text: JSON.stringify(answerPayload),
                                width: 256,
                                height: 256,
                            });
                            // Now the peer needs to scan the host's final answer
                            setTimeout(startPeerScannerForHostAnswer, 1000);
                        }
                    };

                    const dataChannel = localConnection.createDataChannel("gameData");
                    dataChannel.onmessage = (e) => window.handleNetworkData(JSON.parse(e.data));
                    dataChannel.onopen = () => {
                        console.log("Data channel open! Sending join request.");
                        // Let host know we're here.
                        const peerName = window.getPeerName();
                        sendToHost({ type: 'JOIN_REQUEST', name: peerName });
                    }
                    dataChannels.host = dataChannel;

                    await localConnection.setRemoteDescription(new RTCSessionDescription(offer));
                    const answer = await localConnection.createAnswer();
                    await localConnection.setLocalDescription(answer);

                } catch (err) {
                    console.error("Error processing host offer:", err);
                    scannerElement.classList.remove('hidden');
                }
            }
        ).catch(err => console.error("QR scanner failed to start", err));
    }

    function startPeerScannerForHostAnswer() {
        const scannerContainer = document.getElementById('qr-scanner-container');
        scannerContainer.innerHTML = '<div id="qr-scanner"></div>';
        scannerContainer.parentElement.querySelector('p').textContent = "כעת, סרוק את קוד התשובה הסופי מהמארח."

        const scannerElement = document.getElementById('qr-scanner');
        scannerElement.classList.remove('hidden');

        html5QrCode = new Html5Qrcode("qr-scanner");
        html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
                await html5QrCode.stop();
                document.getElementById('peer-qr-code-container').classList.add('hidden');
                scannerContainer.classList.add('hidden');
                scannerContainer.parentElement.querySelector('p').textContent = "מחובר! ממתין שהמארח יתחיל את המשחק...";

                const finalAnswer = JSON.parse(decodedText);
                await localConnection.setRemoteDescription(new RTCSessionDescription(finalAnswer.sdp));
                console.log("Peer connection established with host!");
            }
        ).catch(err => console.error("Failed to start final answer scanner", err));
    }

    // --- DATA SENDING ---

    function sendToHost(data) {
        if (dataChannels.host && dataChannels.host.readyState === 'open') {
            dataChannels.host.send(JSON.stringify(data));
        }
    }

    function sendToPeer(targetPeerId, data) {
        if (dataChannels[targetPeerId] && dataChannels[targetPeerId].readyState === 'open') {
            dataChannels[targetPeerId].send(JSON.stringify(data));
        }
    }

    function broadcast(gameState) {
        if (!window.isHost) return;
        const message = {
            type: 'GAME_STATE_UPDATE',
            payload: gameState
        };
        for (const peerId in dataChannels) {
            sendToPeer(peerId, message);
        }
        // Also update host's own view
        if (gameState.gameStarted) {
            if (document.getElementById('game-screen-host').classList.contains('hidden')) {
                document.getElementById('lobby-screen').classList.add('hidden');
                document.getElementById('game-screen-host').classList.remove('hidden');
            }
            window.renderScoreboard();
            window.updateHostGameScreen();
        }

    }


    window.network = {
        startHost,
        startPeer,
        sendToHost,
        sendToPeer,
        broadcast,
        getPeerId,
    };
})();
