import { useEffect, useState, useRef } from "react";

const useCleanup = (val) => {
  const cameraStreamRef = useRef(val);
  useEffect(() => {
    cameraStreamRef.current = val;
  }, [val]);

  useEffect(() => {
    return () => {
      if (!cameraStreamRef.current) return;
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, []);
};

export const useMedia = (videoElemRef, type = "camera") => {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isCameraAudioOn, setIsCameraAudioOn] = useState(true);
  const [isCameraVideoOn, setIsCameraVideoOn] = useState(true);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraPlaying, setCameraPlaying] = useState(true);

  useEffect(() => {
    if (!videoElemRef.current) {
      return;
    }

    if (!videoElemRef.current instanceof HTMLVideoElement) {
      setCameraError("VideoElemRef is not of type html video element");
      console.error("VideoElemRef is not of type html video element");
      return;
    }

    if (isCameraOn === true) {
      const getCameraPermission = async () =>
        await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

      const getDisplayPermission = async () =>
        await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: "always",
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100,
          },
        });

      let permission = undefined;
      if (type === "camera") {
        permission = getCameraPermission();
      } else if (type === "display") {
        permission = getDisplayPermission();
      } else {
        setCameraError(
          "Invalid/unsupported media type. Only camera and display are supported"
        );
        return;
      }

      permission
        .then((cameraStream) => {
          setCameraStream(cameraStream);
          videoElemRef.current.srcObject = cameraStream;
        })
        .catch((e) => {
          setCameraError(e.message);
          setCameraPlaying(false);
        });
      return;
    }

    // if the camera is turned off
    if (cameraStream && isCameraOn === false) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
      videoElemRef.current.srcObject = null;
    }
  }, [videoElemRef, isCameraOn]);

  // handling video play pause
  useEffect(() => {
    if (type === "display") return;
    const videoElement = videoElemRef.current;

    if (cameraPlaying) {
      videoElement.play();
    } else {
      videoElement.pause();
    }
  }, [cameraPlaying, videoElemRef.current]);

  // handling audio mute unmute
  useEffect(() => {
    if (!cameraStream) return;
    cameraStream.getAudioTracks()[0].enabled = isCameraAudioOn;
    return () => {
      console.log("useEffect 3");
    };
  }, [isCameraAudioOn]);

  // handling video on off
  useEffect(() => {
    if (!cameraStream) return;
    cameraStream.getVideoTracks()[0].enabled = isCameraVideoOn;
  }, [isCameraVideoOn]);

  // run only on unmount
  useCleanup(cameraStream);

  if (type === "camera") {
    return {
      cameraStream,
      isCameraOn,
      setIsCameraOn,
      cameraPlaying,
      setCameraPlaying,
      isCameraAudioOn,
      setIsCameraAudioOn,
      isCameraVideoOn,
      setIsCameraVideoOn,
      cameraError,
    };
  }

  if (type === "display") {
    return {
      displayStream: cameraStream,
      isDisplayOn: isCameraOn,
      setIsDisplayOn: setIsCameraOn,
      displayPlaying: cameraPlaying,
      setDisplayPlaying: setCameraPlaying,
      isDisplayVideoOn: isCameraVideoOn,
      setIsDisplayVideoOn: setIsCameraVideoOn,
      displayError: cameraError,
    };
  }
};
