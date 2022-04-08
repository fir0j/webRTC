import { set } from "express/lib/application";
import { useEffect, useState, useRef } from "react";

// it will run when the component will be unmounted
const useCleanup = (val) => {
  const valRef = useRef(val);
  useEffect(() => {
    valRef.current = val;
  }, [val]);

  useEffect(() => {
    return () => {
      // cleanup based on valRef.current
      console.log("cleaning up based on valueRef.current");
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
    } else if (cameraStream) {
      // stop camera without revoking permission
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
      videoElemRef.current.srcObject = null;
    }
  }, [videoElemRef.current, isCameraOn]);

  useCleanup(videoElemRef.current);

  useEffect(() => {
    const videoElement = videoElemRef.current;

    if (cameraPlaying) {
      videoElement.play();
    } else {
      videoElement.pause();
    }
  }, [cameraPlaying, videoElemRef]);

  useEffect(() => {
    if (!cameraStream) return;
    cameraStream.getAudioTracks()[0].enabled = isCameraAudioOn;
  }, [isCameraAudioOn]);

  useEffect(() => {
    if (!cameraStream) return;
    cameraStream.getVideoTracks()[0].enabled = isCameraVideoOn;
  }, [isCameraVideoOn]);

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
