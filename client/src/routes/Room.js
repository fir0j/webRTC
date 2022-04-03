import React, { useRef, useEffect, useState } from "react";
import io from "socket.io-client";
import { useReactMediaRecorder } from "react-media-recorder";
import { useParams } from "react-router-dom";

const Room = (props) => {
  const params = useParams();

  const rtcPeerRef = useRef();
  const socketRef = useRef();
  const remoteUserIdRef = useRef();
  const localWebcamStreamRef = useRef();
  const remoteWebcamStreamRef = useRef();
  const rtcRtpsenderRef = useRef();

  // html elements
  const localWebcamVideoElemRef = useRef();
  const remoteWebcamVideoElemRef = useRef();

  const [isCalling, setIsCalling] = useState(false);
  const [isGettingCall, setIsGettingCall] = useState(false);
  const [isCallReceived, setIsCallReceived] = useState(null);
  const [incomingPayload, setIncomingPayload] = useState(null);
  const incomingCandidateRef = useRef([]);

  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);

  const { status, startRecording, stopRecording, mediaBlobUrl } =
    useReactMediaRecorder({ screen: false, audio: false, video: true });

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        // saving stream
        localWebcamStreamRef.current = stream;
        // attaching to video element
        localWebcamVideoElemRef.current.srcObject =
          localWebcamStreamRef.current;

        socketRef.current = io.connect("/");
        socketRef.current.emit("join room", params.roomID);

        socketRef.current.on("other user", (userID) => {
          remoteUserIdRef.current = userID;
        });

        socketRef.current.on("user joined", (userID) => {
          remoteUserIdRef.current = userID;
        });

        socketRef.current.on("offer", handleReceiveCall);
        socketRef.current.on("answer", handleAnswerCall);
        socketRef.current.on("ice-candidate", handleNewICECandidateMsg);
        socketRef.current.on("call-end", handleCallEnd);
      });
  }, []);

  function handleReceiveCall(incoming) {
    setIncomingPayload(incoming);
    setIsGettingCall(true);
  }

  function recieveCall(incoming) {
    setIsGettingCall(false);
    setIsCallReceived(true);

    rtcPeerRef.current = createPeer();
    console.log("handling receive call by peer", rtcPeerRef.current);

    const desc = new RTCSessionDescription(incomingPayload.sdp);
    rtcPeerRef.current
      .setRemoteDescription(desc)
      .then(() => {
        localWebcamStreamRef.current
          .getTracks()
          .forEach((track) =>
            rtcPeerRef.current.addTrack(track, localWebcamStreamRef.current)
          );
      })
      .then(() => {
        return rtcPeerRef.current.createAnswer();
      })
      .then((answer) => {
        return rtcPeerRef.current.setLocalDescription(answer);
      })
      .then(() => {
        const payload = {
          calle: incomingPayload.caller,
          caller: socketRef.current.id,
          sdp: rtcPeerRef.current.localDescription,
        };
        socketRef.current.emit("answer", payload);
      });

    incomingCandidateRef.current.forEach((candidate) => {
      rtcPeerRef.current
        .addIceCandidate(candidate)
        .catch((e) => console.log(e));
    });
  }

  function handleAnswerCall(message) {
    setIsCallReceived(true);
    setIsCalling(false);
    const desc = new RTCSessionDescription(message.sdp);
    rtcPeerRef.current.setRemoteDescription(desc).catch((e) => console.log(e));
  }

  function handleNewICECandidateMsg(incoming) {
    console.log("handle NewICECandidate msg", incoming);
    const candidate = new RTCIceCandidate(incoming);
    if (rtcPeerRef.current) {
      rtcPeerRef.current
        .addIceCandidate(candidate)
        .catch((e) => console.log(e));
    } else {
      incomingCandidateRef.current.push(candidate);
    }
  }

  function createPeer() {
    console.log("creating RTC Peer");
    const peer = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.stunprotocol.org",
        },
        // {
        //   urls: "turn:numb.viagenie.ca",
        //   credential: "muazkh",
        //   username: "webrtc@live.com",
        // },
      ],
    });

    peer.onnegotiationneeded = handleNegotiationNeededEvent;
    peer.onicecandidate = handleICECandidateEvent;
    peer.ontrack = handleTrackEvent;

    return peer;
  }

  function handleNegotiationNeededEvent() {
    console.log("1. [webRTC layer] handleNegotiationNeededEvent");
    rtcPeerRef.current
      .createOffer()
      .then((offer) => {
        return rtcPeerRef.current.setLocalDescription(offer);
      })
      .then(() => {
        const payload = {
          calle: remoteUserIdRef.current,
          caller: socketRef.current.id,
          sdp: rtcPeerRef.current.localDescription,
        };
        socketRef.current.emit("offer", payload);
      })
      .catch((e) => console.log(e));
  }

  function handleICECandidateEvent(e) {
    console.log("2. [webRTC layer] handleICECandidateEvent");
    if (e.candidate) {
      const payload = {
        calle: remoteUserIdRef.current,
        candidate: e.candidate,
      };
      socketRef.current.emit("ice-candidate", payload);
    }
  }

  function handleTrackEvent(e) {
    console.log("3. [webRTC layer] handleTrack Event");
    remoteWebcamStreamRef.current = e.streams[0];
    remoteWebcamVideoElemRef.current.srcObject = remoteWebcamStreamRef.current;
  }

  function callRemoteUser() {
    console.log("calling User");
    rtcPeerRef.current = createPeer();

    const tracks = localWebcamStreamRef.current.getTracks();
    if (tracks.length) {
      tracks.forEach((track) => {
        rtcPeerRef.current.addTrack(track, localWebcamStreamRef.current);
      });
    }

    setIsCalling(true);
  }

  function handleCallEnd() {
    console.log("ending call");
    // reseting application state
    setIsCalling(false);
    setIsGettingCall(false);
    setIsCallReceived(false);
    rtcPeerRef.current = null;
    remoteUserIdRef.current = null;

    // reseting locals
    localWebcamStreamRef.current.getTracks().forEach((track) => track.stop());
    localWebcamStreamRef.current = null;
    localWebcamVideoElemRef.current.srcObject = null;

    //resetting remotes
    remoteWebcamStreamRef.current.getTracks().forEach((track) => track.stop());
    remoteWebcamVideoElemRef.current.srcObject = null;
    remoteWebcamVideoElemRef.current = null;
  }

  function endCall() {
    socketRef.current.emit("call-end", {
      roomID: params.roomID,
      otherUser: remoteUserIdRef.current,
    });
    handleCallEnd();
  }

  function handleAudioBroadcast(event) {
    console.log(event);
    localWebcamStreamRef.current.getAudioTracks()[0].enabled = !isAudioOn;
    setIsAudioOn((prev) => !prev);
  }

  function handleVideoBroadcast(event) {
    localWebcamStreamRef.current.getVideoTracks()[0].enabled = !isVideoOn;
    setIsVideoOn((prev) => !prev);
  }

  function shareScreen() {
    navigator.mediaDevices
      .getDisplayMedia({
        video: {
          cursor: "always",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      })
      .then((stream) => {
        const screenTrack = stream.getVideoTracks()[0];

        rtcRtpsenderRef.current = rtcPeerRef.current
          .getSenders()
          .find((sender) => sender.track.kind === "video");

        rtcRtpsenderRef.current.replaceTrack(screenTrack);

        screenTrack.onended = function () {
          rtcRtpsenderRef.current.replaceTrack(
            localWebcamStreamRef.current.getTracks()[1]
          );
        };
      });
  }

  function stopScreenShare() {
    rtcRtpsenderRef.current.replaceTrack(
      localWebcamStreamRef.current.getTracks()[1]
    );
  }

  const RecordView = () => (
    <div>
      <p>{status}</p>
      <button onClick={startRecording}>Start Recording</button>
      <button onClick={stopRecording}>Stop Recording</button>
      <a href={mediaBlobUrl} download="file">
        download File
      </a>
    </div>
  );

  return (
    <div>
      <video
        style={{ height: 500, width: 500 }}
        autoPlay
        ref={localWebcamVideoElemRef}
      />

      <button onClick={handleAudioBroadcast}>
        {isAudioOn ? " Turn off audio" : "Turn on audio"}
      </button>
      <button onClick={handleVideoBroadcast}>
        {isVideoOn ? " Turn off video" : "Turn on video"}
      </button>

      <video
        style={{ height: 500, width: 500 }}
        autoPlay
        ref={remoteWebcamVideoElemRef}
      />
      <button onClick={handleAudioBroadcast}>
        {isAudioOn ? " Turn off audio" : "Turn on audio"}
      </button>
      <button onClick={handleVideoBroadcast}>
        {isVideoOn ? " Turn off video" : "Turn on video"}
      </button>
      {isGettingCall || isCalling || isCallReceived ? (
        <div onClick={endCall}>
          <button>End Call</button>
        </div>
      ) : (
        <div onClick={callRemoteUser}>
          <button>Call</button>
        </div>
      )}

      {isGettingCall && (
        <>
          <div> {remoteUserIdRef.current} is calling you </div>
          <div onClick={recieveCall}>
            <button>Receive Call</button>
          </div>
        </>
      )}

      {!isGettingCall && isCalling && (
        <div>
          calling ...
          <br /> {remoteUserIdRef.current}
        </div>
      )}
      <button onClick={shareScreen}>Share screen</button>
      <button onClick={stopScreenShare}>Stop Share screen</button>
    </div>
  );
};

export default Room;
