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
import { useISLCaption } from "../useISLCaption";
import { useWordCaption } from "../useWordCaption";

const Call = () => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [cameraStarted, setCameraStarted] = useState(false);
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
  const [remoteCaption, setRemoteCaption] = useState("");
  const [captionRunning, setCaptionRunning] = useState(false);
    const [islEnabled, setIslEnabled] = useState(false);

  const { caption: islCaption, clear: clearIsl } = useISLCaption(
    localVideoRef,
    islEnabled && cameraStarted,
    (text) => {
      if (remoteIdRef.current) {
        socket.emit("sendCaption", { to: remoteIdRef.current, caption: text });
      }
    }
  );

  const [wordEnabled, setWordEnabled] = useState(false);
  const [wordCaption, setWordCaption] = useState("");

  const { lastWord } = useWordCaption(
    localVideoRef,
    wordEnabled && cameraStarted,
    (word, conf) => {
      setWordCaption((prev) => `${prev} ${word}`.trim().slice(-100));
      if (remoteIdRef.current) {
        socket.emit("sendCaption", { to: remoteIdRef.current, caption: `[${word}]` });
      }
    }
  );

  const recognitionRef = useRef(null);
  const recognitionRunningRef = useRef(false);
    

  const peerRef = useRef(null);
  const remoteIdRef = useRef("");
  useEffect(() => {
    
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

  console.log("MY SOCKET ID:", myId);
console.log("REMOTE SOCKET ID:", remoteIdRef.current);
console.log("CAPTION:", transcript);

if (remoteIdRef.current) {
  console.log(
    "SENDING CAPTION TO:",
    remoteIdRef.current
  );

  socket.emit("sendCaption", {
    to: remoteIdRef.current,
    caption: transcript,
  });
} else {
  console.log(
    "NO REMOTE SOCKET ID — CAPTION NOT SENT"
  );
}
};
recognition.onerror = (e) => {
  console.log("Speech Error:", e);
};

recognition.onend = () => {
  console.log("Speech Recognition Ended");

  recognitionRunningRef.current = false;
  setCaptionRunning(false);
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

    if (socket.connected) {
      console.log("SOCKET ALREADY CONNECTED:", socket.id);
      setMyId(socket.id);
    }

 socket.on("callUser", (data) => {
  console.log("INCOMING CALL");
  console.log("CALLER SOCKET ID:", data.from);

  setReceivingCall(true);
  setCaller(data.from);
  setCallerSignal(data.signal);

  // Automatically remember the caller as the remote user
  setRemoteId(data.from);
  remoteIdRef.current = data.from;
});

    socket.on("callAccepted", (signal) => {
      console.log("CALL ACCEPTED");

      setCallAccepted(true);

      if (peerRef.current) {
        peerRef.current.signal(signal);
      }
    });
    socket.on("receiveCaption", (text) => {
      setRemoteCaption(text);
    });

    return () => {
      socket.off("connect");
      socket.off("me");
      socket.off("callUser");
      socket.off("callAccepted");
      socket.off("receiveCaption");
    };
  }, []);
   
   const startListening = () => {
  if (
    recognitionRef.current &&
    !recognitionRunningRef.current
  ) {
    recognitionRef.current.start();
    recognitionRunningRef.current = true;
    setCaptionRunning(true);

    console.log("Speech Recognition Started");
  }
};

  const stopListening = () => {
  if (
    recognitionRef.current &&
    recognitionRunningRef.current
  ) {
    recognitionRef.current.stop();
    recognitionRunningRef.current = false;
    setCaptionRunning(false);

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
    setCameraStarted(true);

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
    remoteIdRef.current = remoteId;
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
    remoteIdRef.current = caller;
    setRemoteId(caller);

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
        onChange={(e) => {
  setRemoteId(e.target.value);
  remoteIdRef.current = e.target.value;
}}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: "8px",
          border: "none",
          marginBottom: "20px",
        }}
      />
      <button
  onClick={startVideo}
  disabled={cameraStarted}
  style={{
    padding: "12px 20px",
    background: cameraStarted ? "#6b7280" : "#16a34a",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    marginRight: "15px",
  }}
>
  {cameraStarted ? "Camera Started" : "Start Camera"}
</button>
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
  onClick={captionRunning ? stopListening : startListening}
  style={{
    padding: "10px 20px",
    background: captionRunning ? "red" : "green",
    color: "white",
    border: "none",
    borderRadius: "8px",
    marginRight: "10px",
    cursor: "pointer",
  }}
>
  {captionRunning ? "Stop Caption" : "Start Caption"}
</button>

    <button
    onClick={() => setIslEnabled((v) => !v)}
    style={{
      padding: "10px 20px",
      background: islEnabled ? "#dc2626" : "#7c3aed",
      color: "white", border: "none", borderRadius: "8px",
      marginLeft: "10px", cursor: "pointer",
    }}
  >
    {islEnabled ? "Stop ISL" : "Start ISL"}
  </button>
  <button
    onClick={() => setWordEnabled((v) => !v)}
    style={{
      padding: "10px 20px",
      background: wordEnabled ? "#dc2626" : "#0891b2",
      color: "white", border: "none", borderRadius: "8px",
      marginLeft: "10px", cursor: "pointer",
    }}
  >
    {wordEnabled ? "Stop Words" : "Start Words"}
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
  <div
  style={{
    marginTop: "20px",
    background: "#1e293b",
    padding: "20px",
    borderRadius: "10px",
  }}
>
  <h3>Remote User Caption</h3>

  <p
    style={{
      fontSize: "20px",
      color: "#38bdf8",
    }}
  >
    {remoteCaption}
  </p>
    <h3>ISL Caption</h3>
  <p style={{ fontSize: "24px", color: "#a78bfa", letterSpacing: "2px" }}>
    {islCaption}
    <button onClick={clearIsl} style={{ marginLeft: "15px", fontSize: "12px" }}>
      Clear
    </button>
  </p>
  <h3>Word Caption</h3>
  <p style={{ fontSize: "22px", color: "#22d3ee", letterSpacing: "1px" }}>
    {wordCaption}
    <button onClick={() => setWordCaption("")} style={{ marginLeft: "15px", fontSize: "12px" }}>
      Clear
    </button>
  </p>
</div>
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