import { io } from "socket.io-client";

const socket = io("http://10.245.133.164:5000", {
  transports: ["websocket", "polling"],
});

export default socket;