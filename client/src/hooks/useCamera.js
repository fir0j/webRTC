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

export const useCamera = (videoElemRef) => {
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

      getCameraPermission()
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
    if (cameraPlaying) {
      videoElemRef.current.play();
    } else {
      videoElemRef.current.pause();
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
};
