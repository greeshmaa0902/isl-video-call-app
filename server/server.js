const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config();

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  methods: ["GET", "POST"],
},
});

// Middleware
app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

// Socket Connection
io.on("connection", (socket) => {
  console.log("=================================");
  console.log("NEW SOCKET CONNECTED");
  console.log("Socket ID:", socket.id);
  console.log("=================================");

  setTimeout(() => {
  socket.emit("me", socket.id);
}, 1000);

  socket.on("callUser", (data) => {
    io.to(data.userToCall).emit(
      "callUser",
      {
        signal: data.signalData,
        from: data.from,
      }
    );
  });

  socket.on("answerCall", (data) => {
    io.to(data.to).emit(
      "callAccepted",
      data.signal
    );
  });
  // Send live captions
   socket.on("sendCaption", (data) => {
    console.log("SERVER RECEIVED CAPTION:", data);
    console.log("SENDING CAPTION TO:", data.to);
     io.to(data.to).emit("receiveCaption", data.caption);
  });
  socket.on("disconnect", () => {
    console.log(
      "User Disconnected:",
      socket.id
    );
  });
});

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");

    server.listen(process.env.PORT, () => {
      console.log(
        `Server running on port ${process.env.PORT}`
      );
    });
  })
  .catch((error) => {
    console.log(error);
  });