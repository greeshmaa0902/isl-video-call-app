import React, {
  useEffect,
  useRef,
  useState,
} from "react";
const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;
import socket from "../socket";
import Peer from "simple-peer";


const Call = () => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [myId, setMyId] = useState("");
  const [remoteId, setRemoteId] =
    useState("");

  const [receivingCall, setReceivingCall] =
    useState(false);

  const [caller, setCaller] =
    useState("");

  const [callerSignal, setCallerSignal] =
    useState(null);

  const [callAccepted, setCallAccepted] =
    useState(false);
  
  
  const [caption, setCaption] = useState("");

  const recognitionRef = useRef(null);

    

  const peerRef = useRef(null);

  useEffect(() => {
    startVideo();
    if (SpeechRecognition) {

  const recognition = new SpeechRecognition();

  recognition.continuous = true;

  recognition.interimResults = true;

  recognition.lang = "en-US";

  recognition.onresult = (event) => {

    let transcript = "";

    for (
      let i = event.resultIndex;
      i < event.results.length;
      i++
    ) {
      transcript += event.results[i][0].transcript;
    }

    setCaption(transcript);
  };

  recognition.onerror = (e) => {
    console.log("Speech Error:", e);
  };
  recognition.onend = () => {
  console.log("Speech Recognition Ended");

  if (recognitionRef.current) {
    recognitionRef.current.start();
  }
};

  recognitionRef.current = recognition;

}

    socket.on("connect", () => {
      console.log(
        "SOCKET CONNECTED:",
        socket.id
      );

      setMyId(socket.id);
    });

    socket.on("me", (id) => {
      console.log("MY SOCKET ID:", id);
      setMyId(id);
    });

    socket.on("callUser", (data) => {
      console.log("INCOMING CALL");

      setReceivingCall(true);
      setCaller(data.from);
      setCallerSignal(data.signal);
    });

    socket.on("callAccepted", (signal) => {
      console.log("CALL ACCEPTED");

      setCallAccepted(true);

      if (peerRef.current) {
        peerRef.current.signal(signal);
      }
    });

    return () => {
      socket.off("connect");
      socket.off("me");
      socket.off("callUser");
      socket.off("callAccepted");
    };
  }, []);
   const startListening = () => {

  if (recognitionRef.current) {

    recognitionRef.current.start();

    console.log("Speech Recognition Started");

  }

};

const stopListening = () => {

  if (recognitionRef.current) {

    recognitionRef.current.stop();

    console.log("Speech Recognition Stopped");

  }

};
  const startVideo = async () => {
   
  try {
    const currentStream =
    await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
    });

    console.log("CAMERA STARTED");

    setStream(currentStream);

    if (localVideoRef.current) {
      localVideoRef.current.srcObject =
        currentStream;
    }
  } catch (error) {
    console.log("MEDIA ERROR:", error);

    alert(error.message);
  }
};

  const callUser = () => {
    if (!stream) {
      alert("Camera not ready");
      return;
    }

    if (!remoteId) {
      alert("Enter remote socket ID");
      return;
    }

    console.log("CALLING:", remoteId);

    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
    });

    peerRef.current = peer;

    peer.on("signal", (data) => {
      console.log("SENDING SIGNAL");

      socket.emit("callUser", {
        userToCall: remoteId,
        signalData: data,
        from: myId,
      });
    });

    peer.on("stream", (remoteStream) => {
      console.log(
        "REMOTE STREAM RECEIVED"
      );

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject =
          remoteStream;
      }
    });

    peer.on("error", (err) => {
      console.log("PEER ERROR:", err);
    });
  };

  const answerCall = () => {
    if (!stream) {
      alert("Camera not ready");
      return;
    }

    setCallAccepted(true);

    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
    });

    peerRef.current = peer;

    peer.on("signal", (data) => {
      console.log("ANSWERING CALL");

      socket.emit("answerCall", {
        signal: data,
        to: caller,
      });
    });

    peer.on("stream", (remoteStream) => {
      console.log(
        "REMOTE STREAM RECEIVED"
      );

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject =
          remoteStream;
      }
    });

    peer.on("error", (err) => {
      console.log("PEER ERROR:", err);
    });

    peer.signal(callerSignal);

    setReceivingCall(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "white",
        padding: "30px",
      }}
    >
      <h1>Video Call</h1>

      <h3>Your Socket ID</h3>

      <div
        style={{
          background: "#1e293b",
          padding: "10px",
          borderRadius: "10px",
          marginBottom: "20px",
          wordBreak: "break-all",
        }}
      >
        {myId || "Connecting..."}
      </div>

      <input
        type="text"
        placeholder="Enter Remote Socket ID"
        value={remoteId}
        onChange={(e) =>
          setRemoteId(e.target.value)
        }
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: "8px",
          border: "none",
          marginBottom: "20px",
        }}
      />

      <button
        onClick={callUser}
        style={{
          padding: "12px 20px",
          background: "#3b82f6",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
        }}
      >
        Call User
      </button>
      <div style={{ marginTop: "20px" }}>
  <button
    onClick={startListening}
    style={{
      padding: "10px 20px",
      background: "green",
      color: "white",
      border: "none",
      borderRadius: "8px",
      marginRight: "10px",
      cursor: "pointer",
    }}
  >
    Start Caption
  </button>

  <button
    onClick={stopListening}
    style={{
      padding: "10px 20px",
      background: "red",
      color: "white",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
    }}
  >
    Stop Caption
  </button>
</div>
<div
  style={{
    marginTop: "30px",
    background: "#1e293b",
    padding: "20px",
    borderRadius: "10px",
  }}
>
  <h3>Live Caption</h3>

  <p
    style={{
      fontSize: "20px",
      color: "#22c55e",
    }}
  >
    {caption}
  </p>
</div>
      {receivingCall && !callAccepted && (
        <div style={{ marginTop: "20px" }}>
          <h3>Incoming Call...</h3>

          <button
            onClick={answerCall}
            style={{
              padding: "10px 20px",
              background: "green",
              color: "white",
              border: "none",
              borderRadius: "8px",
              marginRight: "10px",
              cursor: "pointer",
            }}
          >
            Accept Call
          </button>

          <button
            onClick={() =>
              setReceivingCall(false)
            }
            style={{
              padding: "10px 20px",
              background: "red",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Decline
          </button>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: "20px",
          marginTop: "30px",
        }}
      >
        <div>
          <h3>My Video</h3>

          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: "400px",
              height: "300px",
              background: "black",
              borderRadius: "20px",
              border: "4px solid white",
              objectFit: "cover",
            }}
          />
        </div>

        <div>
          <h3>Remote Video</h3>

          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              width: "400px",
              height: "300px",
              background: "black",
              borderRadius: "20px",
              border: "4px solid white",
              objectFit: "cover",
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default Call;