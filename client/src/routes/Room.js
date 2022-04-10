import React, { useRef, useEffect, useState } from "react";
import io from "socket.io-client";
import { useReactMediaRecorder } from "react-media-recorder";
import { useParams } from "react-router-dom";
import { useScreenshot, createFileName } from "use-react-screenshot";
import { useCamera } from "../hooks/useCamera";

const Room = (props) => {
  const params = useParams();

  const myPeerConnectionRef = useRef();
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

  const { status, startRecording, stopRecording, mediaBlobUrl } =
    useReactMediaRecorder({ screen: false, audio: true, video: true });

  const [image, takeScreenShot] = useScreenshot({
    type: "image/jpeg",
    quality: 1.0,
  });

  const {
    cameraStream,
    setIsCameraOn,
    cameraPlaying,
    setCameraPlaying,
    isCameraAudioOn,
    setIsCameraAudioOn,
    isCameraVideoOn,
    setIsCameraVideoOn,
  } = useCamera(localWebcamVideoElemRef);

  const download = (
    image,
    { name = "kyc-screenshot", extension = "jpg" } = {}
  ) => {
    const a = document.createElement("a");
    a.href = image;
    a.download = createFileName(extension, name);
    a.click();
  };

  const downloadScreenshot = () =>
    takeScreenShot(remoteWebcamVideoElemRef.current).then(download);

  useEffect(() => {
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
    socketRef.current.on("call-end", handleCloseVideoCall);
  }, []);

  function handleReceiveCall(incoming) {
    setIncomingPayload(incoming);
    setIsGettingCall(true);
  }

  async function recieveCall() {
    setIsGettingCall(false);
    setIsCallReceived(true);

    myPeerConnectionRef.current = createPeer();
    console.log("handling receive call by peer", myPeerConnectionRef.current);

    const rtcSessionDesc = new RTCSessionDescription(incomingPayload.sdp);
    await myPeerConnectionRef.current.setRemoteDescription(rtcSessionDesc); // acknowledging that other peer's sdp is received successfully.

    // adding all local tracks of receiving peer to its current rtcConnection
    const localTracks = await cameraStream.getTracks();
    localTracks.forEach((track) =>
      myPeerConnectionRef.current.addTrack(track, cameraStream)
    );

    const sdpAnswer = await myPeerConnectionRef.current.createAnswer();
    await myPeerConnectionRef.current.setLocalDescription(sdpAnswer);

    const payload = {
      calle: incomingPayload.caller,
      caller: socketRef.current.id,
      sdp: myPeerConnectionRef.current.localDescription,
    };
    await socketRef.current.emit("answer", payload);
    // after emitting answer, ICE layers start sending ice-candidates to the caller.

    incomingCandidateRef.current.forEach((candidate) =>
      myPeerConnectionRef.current
        .addIceCandidate(candidate)
        .catch((e) => console.log(e))
    );
  }

  async function handleAnswerCall(message) {
    try {
      setIsCallReceived(true);
      setIsCalling(false);
      const rtcSessionDesc = new RTCSessionDescription(message.sdp);
      // informing WebRTC layer of caller side about calle's session connection.
      await myPeerConnectionRef.current.setRemoteDescription(rtcSessionDesc);
      // now the call is connected.
    } catch (err) {
      console.log("error while handling answer", err);
    }
  }

  function handleNewICECandidateMsg(incoming) {
    console.log("handle NewICECandidate msg", incoming);
    const candidate = new RTCIceCandidate(incoming);
    if (myPeerConnectionRef.current) {
      myPeerConnectionRef.current
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

    // onnegotiationneeded is fired when tracks are added to the rtc connection
    peer.ontrack = handleTrackEvent;
    peer.onnegotiationneeded = handleNegotiationNeededEvent;
    peer.onicecandidate = handleICECandidateEvent;
    peer.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
    peer.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
    peer.onsignalingstatechange = handleSignalingStateChangeEvent;

    return peer;
  }

  function handleTrackEvent(e) {
    console.log("3. [webRTC layer] handleTrack Event");
    remoteWebcamStreamRef.current = e.streams[0];
    console.log(e.streams[0]);
    remoteWebcamVideoElemRef.current.srcObject = remoteWebcamStreamRef.current;
  }

  // it is fired when tracks are added to the rtcConnection
  async function handleNegotiationNeededEvent() {
    try {
      console.log("1. [webRTC layer] handleNegotiationNeededEvent");
      const sdpOffer = await myPeerConnectionRef.current.createOffer();

      // If the connection hasn't yet achieved the "stable" state,
      // return to the caller. Another negotiationneeded event
      // will be fired when the state stabilizes.
      console.log(myPeerConnectionRef.current.signalingState);
      if (myPeerConnectionRef.current.signalingState != "stable") {
        console.log("-- The connection isn't stable yet; postponing...");
        return;
      }

      await myPeerConnectionRef.current.setLocalDescription(sdpOffer); // setting localDescription
      const payload = {
        calle: remoteUserIdRef.current,
        caller: socketRef.current.id,
        sdp: myPeerConnectionRef.current.localDescription, // getting localDescription
      };
      await socketRef.current.emit("offer", payload);
    } catch (err) {
      console.log("Error in onNegotiationNeeded", err);
    }
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

  // This will detect when the ICE connection is changed
  //
  // This is called when the state of the ICE agent changes.
  function handleICEConnectionStateChangeEvent() {
    switch (myPeerConnectionRef.current.iceConnectionState) {
      case "new":
        console.log(
          "iceConnectionState (new): the ICE agent is waiting for remote candidates or gathering addresses."
        );
        break;
      case "checking":
        console.log(
          "iceConnectionState (checking): the ICE agent has remote candidates, but it has not found a connection yet."
        );
        break;
      case "connected":
        console.log(
          "iceConnectionState (connected): the ICE agent has found a usable connection, but is still checking more remote candidate for better connection."
        );
        break;
      case "completed":
        console.log(
          "iceConnectionState (completed): the ICE agent has found a usable connection and stopped testing remote candidates."
        );
        break;
      case "closed":
        console.log("iceConnectionState (closed): the ICE agent is closed.");
        break;
      case "failed":
        console.log(
          "iceConnectionState (failed): the ICE agent has checked all the remote candidates but didn't find a match for at least one component."
        );
        break;
      case "disconnected":
        console.log(
          "iceConnectionState (disconnected): at least one component is no longer alive."
        );
        closeVideoCall();
        break;
    }
  }

  // Set up a |signalingstatechange| event handler. This will detect when
  // the signaling connection is closed.
  //
  // NOTE: This will actually move to the new RTCPeerConnectionState enum
  // returned in the property RTCPeerConnection.connectionState when
  // browsers catch up with the latest version of the specification!

  function handleSignalingStateChangeEvent() {
    switch (myPeerConnectionRef.current.signalingState) {
      case "stable":
        console.log(
          "Signaling state (stable): The initial state. There is no SDP offer/answer exchange in progress."
        );
        break;
      case "have-local-offer":
        console.log(
          "Signaling state (have-local-offer): the local side of the connection has locally applied a SDP offer."
        );
        break;
      case "have-remote-offer":
        console.log(
          "Signaling state (have-remote-offer): the remote side of the connection has locally applied a SDP offer."
        );
        break;
      case "have-local-pranswer":
        console.log(
          "Signaling state (have-local-pranswer): a remote SDP offer has been applied, and a SDP pranswer applied locally."
        );
        break;
      case "have-remote-pranswer":
        console.log(
          "Signaling state (have-remote-pranswer): a local SDP has been applied, and a SDP pranswer applied remotely."
        );
        break;
      case "closed":
        console.log("Signaling state (closed): the ICE agent has been closed.");
        closeVideoCall();
        break;
    }
  }

  // Handle the |icegatheringstatechange| event. This lets us know what the
  // ICE engine is currently working on: new, gathering or complete.
  // Note that the engine can alternate between "gathering" and "complete" repeatedly as needs and
  // circumstances change.
  //
  // We don't need to do anything when this happens, but we log it to the
  // console so you can see what's going on when playing with the sample.

  function handleICEGatheringStateChangeEvent() {
    switch (myPeerConnectionRef.current.iceGatheringState) {
      case "new":
        console.log("Signaling state (new): the object was just created.");
      case "gathering":
        console.log(
          "Signaling state (gathering): the ICE agent is in the process of gathering candidates."
        );
      case "complete":
        console.log(
          "Signaling state (complete): the ICE agent has completed gathering."
        );
    }
  }

  function callRemoteUser() {
    console.log("calling User");
    myPeerConnectionRef.current = createPeer();
    const localTracks = cameraStream.getTracks();
    if (localTracks.length) {
      localTracks.forEach((track) => {
        // adding a local track to the set of tracks whicl will be transmitted to the other peer
        // Adding a track to a connection triggers renegotiation by firing a negotiationneeded
        // where caller's sdp is created and sent to the other peer
        myPeerConnectionRef.current.addTrack(track, cameraStream);
      });
    }

    setIsCalling(true);
  }

  function handleCloseVideoCall() {
    console.log("ending call");
    // reseting application state
    setIsCalling(false);
    setIsGettingCall(false);
    setIsCallReceived(false);
    myPeerConnectionRef.current = null;
    remoteUserIdRef.current = null;

    // reseting locals
    setIsCameraOn(false);

    //resetting remotes
    remoteWebcamStreamRef.current.getTracks().forEach((track) => track.stop());
    remoteWebcamVideoElemRef.current.srcObject = null;
    remoteWebcamVideoElemRef.current = null;
  }

  function closeVideoCall() {
    socketRef.current.emit("call-end", {
      roomID: params.roomID,
      otherUser: remoteUserIdRef.current,
    });
    handleCloseVideoCall();
  }

  async function shareScreen() {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      rtcRtpsenderRef.current = await myPeerConnectionRef.current
        .getSenders()
        .find((sender) => sender.track.kind === "video");

      const displayTrack = displayStream.getVideoTracks()[0];
      await rtcRtpsenderRef.current.replaceTrack(displayTrack);

      // adding event listeners
      displayTrack.onended = stopScreenShare;
    } catch (err) {
      console.log("Failed to share display screen", err);
    }
  }

  async function stopScreenShare() {
    try {
      const cameraTrack = cameraStream.getVideoTracks()[0];
      await rtcRtpsenderRef.current.replaceTrack(cameraTrack);
    } catch (err) {
      console.log("Failed to stop display screen", err);
    }
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

      <button onClick={() => setIsCameraOn(true)}>turn on Camera</button>
      <button onClick={() => setIsCameraOn(false)}>turn off Camera</button>

      <button onClick={() => setCameraPlaying(!cameraPlaying)}>
        play/pause Camera
      </button>
      <button onClick={() => setIsCameraAudioOn((prev) => !prev)}>
        {isCameraAudioOn ? " Turn off audio" : "Turn on audio"}
      </button>
      <button onClick={() => setIsCameraVideoOn((prev) => !prev)}>
        {isCameraVideoOn ? " Turn off video" : "Turn on video"}
      </button>

      <video
        style={{ height: 500, width: 500 }}
        autoPlay
        ref={remoteWebcamVideoElemRef}
      />
      <button onClick={() => setIsCameraAudioOn((prev) => !prev)}>
        {isCameraAudioOn ? " Turn off audio" : "Turn on audio"}
      </button>
      <button onClick={() => setIsCameraVideoOn((prev) => !prev)}>
        {isCameraVideoOn ? " Turn off video" : "Turn on video"}
      </button>
      {isGettingCall || isCalling || isCallReceived ? (
        <div onClick={closeVideoCall}>
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
      <button onClick={downloadScreenshot}>Download screenshot</button>
      <RecordView />
    </div>
  );
};

export default Room;
