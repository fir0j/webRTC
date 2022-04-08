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

let initialiseDisplay;

export const useDisplay = (videoElemRef) => {
  const [isDisplayOn, setIsDisplayOn] = useState(false);
  const [isDisplayInitialised, setIsDisplayInitialised] = useState(false);
  const [displayStream, setStream] = useState(null);
  const [video, setVideo] = useState(null);
  const [displayError, setDisplayError] = useState("");
  const [isDisplayPlaying, setIsDisplayPlaying] = useState(true);

  useEffect(() => {
    if (isDisplayOn) {
      initialiseDisplay = async () =>
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
      return;
    }
    displayStream.getVideoTracks()[0].enabled = isDisplayOn;
  }, [isDisplayOn]);

  useEffect(() => {
    if (video || !videoElemRef.current) {
      return;
    }

    const videoElement = videoElemRef.current;
    if (videoElement instanceof HTMLVideoElement) {
      setVideo(videoElemRef.current);
    }
  }, [videoElemRef, video]);

  useCleanup(video);

  useEffect(() => {
    if (!video || isDisplayInitialised || !isDisplayPlaying) {
      return;
    }
    if (isDisplayOn) {
      initialiseDisplay()
        .then((displayStream) => {
          setStream(displayStream);
          video.srcObject = displayStream;
          setIsDisplayInitialised(true);
          setIsDisplayOn(true);
        })
        .catch((e) => {
          setDisplayError(e.message);
          setIsDisplayPlaying(false);
        });
    }
  }, [video, isDisplayInitialised, isDisplayOn, isDisplayPlaying]);

  useEffect(() => {
    const videoElement = videoElemRef.current;

    if (isDisplayPlaying) {
      videoElement.play();
    } else {
      videoElement.pause();
    }
  }, [isDisplayPlaying, videoElemRef]);

  return {
    displayStream,
    isDisplayInitialised,
    isDisplayPlaying,
    setIsDisplayPlaying,
    isDisplayOn,
    setIsDisplayOn,
    displayError,
  };
};
