const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

app.use(cors());

const io = new Server(server, {
  cors: { origin: "https://video-calling-app-frontend-ycoy.onrender.com" },
});
//const io = new Server(server, { cors: { origin: "http://localhost:5173" } });

const pairs = {};
const socketRoom = {};

io.on("connection", (socket) => {
  socket.on("join-room", (roomId) => {
    if (!pairs[roomId]) pairs[roomId] = [];

    pairs[roomId].push(socket.id);
    socketRoom[socket.id] = roomId;

    socket.join(roomId);

    if (pairs[roomId].length == 2)
      io.to(roomId).emit("user-joined", {
        first: pairs[roomId][0],
        second: pairs[roomId][1],
      });

    console.log(pairs);
  });

  socket.on("offer", ({ toId, myOffer }) => {
    io.to(toId).emit("incomingOffer", {
      callerOffer: myOffer,
      from: socket.id,
    });
  });

  socket.on("answer", ({ toId, myAnswer }) => {
    io.to(toId).emit("yourAnswer", { calleeAnswer: myAnswer });
  });

  socket.on("ice-candidate", ({ toId, candidate }) => {
    io.to(toId).emit("ice-candidate", { candidate, from: socket.id });
  });

  socket.on("disconnect", () => {
    console.log("disconnect", socket.id);

    const roomId = socketRoom[socket.id];

    if (roomId) {
      pairs[roomId] = pairs[roomId].filter((id) => id !== socket.id);
      delete socketRoom[socket.id];

      socket.leave(roomId);

      if (pairs[roomId].length === 0) {
        delete pairs[roomId];
      }
    }
    console.log("after disconnect, pairs:", pairs);
  });
});

app.use("/", (req, res) => {
  res.send("I am alive");
});

server.listen(5174, () => {
  console.log("server is listening at port 5174");
});
