import React, { useRef, useEffect, useState } from "react";
import io from "socket.io-client";
import { useReactMediaRecorder } from "react-media-recorder";

const Room = (props) => {
  const mySocketRef = useRef();
  const remoteUserIdRef = useRef();
  const myPeerConnectionRef = useRef();
  const myWebcamStreamRef = useRef();
  const myWebcamVideoRef = useRef();
  const remoteWebcamStreamRef = useRef();
  const remoteWebcamVideoRef = useRef();
  // const senders = useRef([]);

  const [isCalling, setIsCalling] = useState(false);
  const [isGettingCall, setIsGettingCall] = useState(false);
  const [isCallReceived, setIsCallReceived] = useState(null);
  const [incomingPayload, setIncomingPayload] = useState(null);
  const incomingCandidateRef = useRef([]);
  const { status, startRecording, stopRecording, mediaBlobUrl } =
    useReactMediaRecorder({ screen: false, audio: false, video: true });

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        // saving stream
        myWebcamStreamRef.current = stream;
        // attaching to video element
        myWebcamVideoRef.current.srcObject = myWebcamStreamRef.current;

        mySocketRef.current = io.connect("/");
        mySocketRef.current.emit("join room", props.match.params.roomID);

        mySocketRef.current.on("other user", (userID) => {
          remoteUserIdRef.current = userID;
        });

        mySocketRef.current.on("user joined", (userID) => {
          remoteUserIdRef.current = userID;
        });

        mySocketRef.current.on("offer", handleReceiveCall);
        mySocketRef.current.on("answer", handleAnswerCall);
        mySocketRef.current.on("ice-candidate", handleNewICECandidateMsg);
        mySocketRef.current.on("call-end", handleCallEnd);
      });
  }, []);

  function handleReceiveCall(incoming) {
    setIncomingPayload(incoming);
    setIsGettingCall(true);
  }

  function recieveCall(incoming) {
    setIsGettingCall(false);
    setIsCallReceived(true);

    myPeerConnectionRef.current = createPeer();
    console.log("handling receive call by peer", myPeerConnectionRef.current);

    const desc = new RTCSessionDescription(incomingPayload.sdp);
    myPeerConnectionRef.current
      .setRemoteDescription(desc)
      .then(() => {
        myWebcamStreamRef.current
          .getTracks()
          .forEach((track) =>
            myPeerConnectionRef.current.addTrack(
              track,
              myWebcamStreamRef.current
            )
          );
      })
      .then(() => {
        return myPeerConnectionRef.current.createAnswer();
      })
      .then((answer) => {
        return myPeerConnectionRef.current.setLocalDescription(answer);
      })
      .then(() => {
        const payload = {
          calle: incomingPayload.caller,
          caller: mySocketRef.current.id,
          sdp: myPeerConnectionRef.current.localDescription,
        };
        mySocketRef.current.emit("answer", payload);
      });
    incomingCandidateRef.current.forEach((candidate) => {
      myPeerConnectionRef.current
        .addIceCandidate(candidate)
        .catch((e) => console.log(e));
    });
  }

  function handleAnswerCall(message) {
    setIsCallReceived(true);
    setIsCalling(false);
    const desc = new RTCSessionDescription(message.sdp);
    myPeerConnectionRef.current
      .setRemoteDescription(desc)
      .catch((e) => console.log(e));
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

    peer.onnegotiationneeded = handleNegotiationNeededEvent;
    peer.onicecandidate = handleICECandidateEvent;
    peer.ontrack = handleTrackEvent;

    return peer;
  }

  function handleNegotiationNeededEvent() {
    console.log("1. [webRTC layer] handleNegotiationNeededEvent");
    myPeerConnectionRef.current
      .createOffer()
      .then((offer) => {
        return myPeerConnectionRef.current.setLocalDescription(offer);
      })
      .then(() => {
        const payload = {
          calle: remoteUserIdRef.current,
          caller: mySocketRef.current.id,
          sdp: myPeerConnectionRef.current.localDescription,
        };
        mySocketRef.current.emit("offer", payload);
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
      mySocketRef.current.emit("ice-candidate", payload);
    }
  }

  function handleTrackEvent(e) {
    console.log("3. [webRTC layer] handleTrack Event");
    remoteWebcamStreamRef.current = e.streams[0];
    remoteWebcamVideoRef.current.srcObject = remoteWebcamStreamRef.current;
  }

  function callOtherUser() {
    console.log("calling User");
    myPeerConnectionRef.current = createPeer();
    myWebcamStreamRef.current
      .getTracks()
      .forEach((track) =>
        myPeerConnectionRef.current.addTrack(track, myWebcamStreamRef.current)
      );

    // saving allMyTracks for screenshare usage
    // myWebcamStreamRef.current
    //   .getTracks()
    //   .forEach((track) =>
    //     senders.current.push(
    //       myPeerConnectionRef.current.addTrack(track, myWebcamStreamRef.current)
    //     )
    //   );
    setIsCalling(true);
  }

  function handleCallEnd() {
    console.log("ending call");
    // reseting application state
    setIsCalling(false);
    setIsGettingCall(false);
    setIsCallReceived(false);
    myPeerConnectionRef.current = null;
    remoteUserIdRef.current = null;

    // reseting locals
    myWebcamStreamRef.current.getTracks().forEach((track) => track.stop());
    myWebcamStreamRef.current = null;
    myWebcamVideoRef.current.srcObject = null;

    //resetting remotes
    remoteWebcamStreamRef.current.getTracks().forEach((track) => track.stop());
    remoteWebcamVideoRef.current.srcObject = null;
    remoteWebcamVideoRef.current = null;
  }

  function endCall() {
    mySocketRef.current.emit("call-end", {
      roomID: props.match.params.roomID,
      otherUser: remoteUserIdRef.current,
    });
    handleCallEnd();
  }

  // function shareScreen() {
  //   navigator.mediaDevices.getDisplayMedia({ cursor: true }).then((stream) => {
  //     const screenTrack = stream.getTracks()[0];
  //     senders.current
  //       .find((sender) => sender.track.kind === "video")
  //       .replaceTrack(screenTrack);
  //     screenTrack.onended = function () {
  //       senders.current
  //         .find((sender) => sender.track.kind === "video")
  //         .replaceTrack(myWebcamStreamRef.current.getTracks()[1]);
  //     };
  //   });
  // }

  // function downloadUrl(url, filename) {
  //   let xhr = new XMLHttpRequest();
  //   xhr.open("GET", url, true);
  //   xhr.responseType = "blob";
  //   xhr.onload = function (e) {
  //     if (this.status == 200) {
  //       const blob = this.response;
  //       const a = document.createElement("a");
  //       document.body.appendChild(a);
  //       const blobUrl = window.URL.createObjectURL(blob);
  //       a.href = blobUrl;
  //       a.download = filename;
  //       a.click();
  //       setTimeout(() => {
  //         window.URL.revokeObjectURL(blobUrl);
  //         document.body.removeChild(a);
  //       }, 0);
  //     }
  //   };
  //   xhr.send();
  // }
  // const RecordView = () => (
  //   <div>
  //     <p>{status}</p>
  //     <button onClick={startRecording}>Start Recording</button>
  //     <button onClick={stopRecording}>Stop Recording</button>
  //     {/* <video src={mediaBlobUrl} controls autoPlay loop /> */}
  //     {/* <button onClick={() => downloadUrl(mediaBlobUrl, "file.mp4")}>
  //       Download file
  //     </button> */}
  //     <a href={mediaBlobUrl} download="file.mp4">
  //       download File
  //     </a>
  //   </div>
  // );

  return (
    <div>
      <video
        style={{ height: 500, width: 500 }}
        autoPlay
        ref={myWebcamVideoRef}
      />
      <video
        style={{ height: 500, width: 500 }}
        autoPlay
        ref={remoteWebcamVideoRef}
      />

      {isGettingCall || isCalling || isCallReceived ? (
        <div onClick={endCall}>
          <button>End Call</button>
        </div>
      ) : (
        <div onClick={callOtherUser}>
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
      {/* <button onClick={shareScreen}>Share screen</button> */}
    </div>
  );
};

export default Room;
