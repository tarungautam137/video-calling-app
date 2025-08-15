import React, { useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";
import { useParams } from "react-router-dom"; // use react-router-dom

const socket = io("http://localhost:5174");

const Room = () => {
  const { roomId } = useParams();

  const myVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);

  const [remoteSocketId, setRemoteSocketId] = useState(null);

  const configuration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  useEffect(() => {
    if (!roomId) return;

    const pc = new RTCPeerConnection(configuration);
    pcRef.current = pc;

    // create/hold remote MediaStream to collect incoming tracks
    remoteStreamRef.current = new MediaStream();
    setRemoteStreamToVideo();

    // when remote track arrives -> add to remote stream
    pc.ontrack = (event) => {
      // event.streams[0] is often present — prefer it
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0];
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
      } else {
        // fallback: add individual track
        remoteStreamRef.current.addTrack(event.track);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
    };

    // When ICE candidate is generated locally, send to remote via socket
    pc.onicecandidate = (event) => {
      if (event.candidate && remoteSocketId) {
        socket.emit("ice-candidate", { toId: remoteSocketId, candidate: event.candidate });
      }
      // if no remoteSocketId yet, we'll still emit when it becomes available
    };

    // helper to attach current remote stream object to video element
    function setRemoteStreamToVideo() {
      if (remoteVideoRef.current && remoteStreamRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
    }

    // get local media
    const startLocalStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (myVideoRef.current) myVideoRef.current.srcObject = stream;

        // add local tracks to the peer connection
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      } catch (err) {
        console.error("Could not get user media", err);
      }
    };

    startLocalStream();

    // ------ Socket handlers ------
    const handleUserJoined = async ({ first, second }) => {
      const otherId = socket.id === first ? second : first;
      setRemoteSocketId(otherId);

      // If we are the first socket in the pair (we initiated), we should create offer
      if (socket.id === first) {
        // ensure tracks already added (they should be)
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { toId: otherId, myOffer: offer });
      }
    };

    const handleIncomingOffer = async ({ callerOffer, from }) => {
      setRemoteSocketId(from);

      // set remote description from caller
      await pc.setRemoteDescription(new RTCSessionDescription(callerOffer));

      // ensure local tracks are added (they should be from startLocalStream)
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { toId: from, myAnswer: answer });
    };

    const handleAnswer = async ({ calleeAnswer }) => {
      // set remote description from answer
      const remoteDesc = new RTCSessionDescription(calleeAnswer);
      await pc.setRemoteDescription(remoteDesc);
    };

    const handleRemoteCandidate = async ({ candidate, from }) => {
      try {
        if (!candidate) return;
        // if incoming candidate arrives before pc is ready, this still works
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("Error adding received ICE candidate", err);
      }
    };

    // register
    socket.on("user-joined", handleUserJoined);
    socket.on("incomingOffer", handleIncomingOffer);
    socket.on("yourAnswer", handleAnswer);
    socket.on("ice-candidate", handleRemoteCandidate);

    // join the room (server will reply with user-joined when pair formed)
    socket.emit("join-room", roomId);

    // Cleanup on unmount
    return () => {
      // tell server we left (optional)
      socket.emit("leave-room", { room: roomId });

      // unregister socket listeners
      socket.off("user-joined", handleUserJoined);
      socket.off("incomingOffer", handleIncomingOffer);
      socket.off("yourAnswer", handleAnswer);
      socket.off("ice-candidate", handleRemoteCandidate);

      // stop local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }

      // close peer connection
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }

      // clear video elements
      if (myVideoRef.current) myVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

      setRemoteSocketId(null);
    };
  }, [roomId]); // re-run if room changes

  return (
    <div className="min-h-screen px-20 py-15 w-screen bg-gray-400">
      <h1 className="text-center text-3xl mb-10">
        {remoteSocketId ? `Other User Socket Id: ${remoteSocketId}` : `Other User Not Present`}
      </h1>

      <div>
        <h1 className="text-center text-3xl mb-10">My Stream</h1>
        <video ref={myVideoRef} autoPlay playsInline muted className="w-[640px] h-[480px] object-cover" />
      </div>

      <div>
        <h1 className="text-center text-3xl mb-10">Remote Stream</h1>
        <video ref={remoteVideoRef} autoPlay playsInline className="w-[640px] h-[480px] object-cover" />
      </div>
    </div>
  );
};

export default Room;
