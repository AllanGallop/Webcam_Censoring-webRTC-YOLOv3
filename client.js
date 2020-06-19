var pc = null, dc = null, dcInterval = null;
var preview = document.getElementById('preview');

function writeConsole(msg)
{
    let consoleLog = document.getElementById('console');
    consoleLog.textContent += msg + '\r\n';
    consoleLog.scrollTop = consoleLog.scrollHeight;
}

function createPeerConnection() {
    //Use Googles Turn server
    var config = {
        sdpSemantics: 'unified-plan',
        iceServers:[{urls: ['stun:stun.l.google.com:19302']}]
    };


    pc = new RTCPeerConnection(config);

    // register some listeners to help debugging
    pc.addEventListener('icegatheringstatechange', function() {
        writeConsole(pc.iceGatheringState);
    }, false);

    pc.addEventListener('iceconnectionstatechange', function() {
        writeConsole(pc.iceConnectionState);
    }, false);

    pc.addEventListener('signalingstatechange', function() {
        writeConsole(pc.signalingState);
    }, false);

    // connect video
    pc.addEventListener('track', function(evt) {
        if (evt.track.kind == 'video')
            document.getElementById('video').srcObject = evt.streams[0];
    });

    return pc;
}

function negotiate() {
    return pc.createOffer().then(function(offer) {
        return pc.setLocalDescription(offer);
    }).then(function() {
        // wait for ICE gathering to complete
        return new Promise(function(resolve) {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                function checkState() {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                }
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(function() {
        var offer = pc.localDescription;
        var codec = "VP8/90000";

        offer.sdp = sdpFilterCodec('video', codec, offer.sdp);

        writeConsole(offer.sdp);
        return fetch('/offer', {
            body: JSON.stringify({
                sdp: offer.sdp,
                type: offer.type,
                video_transform: "edges"
            }),
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });
    }).then(function(response) {
        return response.json();
    }).then(function(answer) {
        writeConsole(answer.sdp);
        return pc.setRemoteDescription(answer);
    }).catch(function(e) {
        alert(e);
    });
}

function start() {
    document.getElementById('start').style.display = 'none';
    pc = createPeerConnection();

    //mediaDevices constraints, be aware the browser may just ignore them
    var constraints = {
         audio:false,
         video: {width: 320, height: 240, frameRate: { ideal: 10, max:20 } }
    };

    if (constraints.video) {

        if(navigator.mediaDevices.getUserMedia){
            navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
                preview.srcObject = stream;
                preview.onloadedmetadata = function(e) {
                  preview.play();
                };
                stream.getTracks().forEach(function(track) {
                    pc.addTrack(track, stream);
                });
                return negotiate();
            }, function(err) {
                alert('Could not acquire media: ' + err);
            });
        }
    } else {
        negotiate();
    }

    document.getElementById('stop').style.display = 'block';
}

function stop() {
    document.getElementById('stop').style.display = 'none';
    document.getElementById('start').style.display = 'block';
    preview.pause();
    // close data channel
    if (dc) {
        dc.close();
    }

    // close transceivers
    if (pc.getTransceivers) {
        pc.getTransceivers().forEach(function(transceiver) {
            if (transceiver.stop) {
                transceiver.stop();
            }
        });
    }

    // close local audio / video
    pc.getSenders().forEach(function(sender) {
        sender.track.stop();
    });

    // close peer connection
    setTimeout(function() {
        pc.close();
    }, 500);
}

function sdpFilterCodec(kind, codec, realSdp) {
    var allowed = []
    var rtxRegex = new RegExp('a=fmtp:(\\d+) apt=(\\d+)\r$');
    var codecRegex = new RegExp('a=rtpmap:([0-9]+) ' + escapeRegExp(codec))
    var videoRegex = new RegExp('(m=' + kind + ' .*?)( ([0-9]+))*\\s*$')
    
    var lines = realSdp.split('\n');

    var isKind = false;
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('m=' + kind + ' ')) {
            isKind = true;
        } else if (lines[i].startsWith('m=')) {
            isKind = false;
        }

        if (isKind) {
            var match = lines[i].match(codecRegex);
            if (match) {
                allowed.push(parseInt(match[1]));
            }

            match = lines[i].match(rtxRegex);
            if (match && allowed.includes(parseInt(match[2]))) {
                allowed.push(parseInt(match[1]));
            }
        }
    }

    var skipRegex = 'a=(fmtp|rtcp-fb|rtpmap):([0-9]+)';
    var sdp = '';

    isKind = false;
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('m=' + kind + ' ')) {
            isKind = true;
        } else if (lines[i].startsWith('m=')) {
            isKind = false;
        }

        if (isKind) {
            var skipMatch = lines[i].match(skipRegex);
            if (skipMatch && !allowed.includes(parseInt(skipMatch[2]))) {
                continue;
            } else if (lines[i].match(videoRegex)) {
                sdp += lines[i].replace(videoRegex, '$1 ' + allowed.join(' ')) + '\n';
            } else {
                sdp += lines[i] + '\n';
            }
        } else {
            sdp += lines[i] + '\n';
        }
    }

    return sdp;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
