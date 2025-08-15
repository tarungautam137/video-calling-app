import { useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";
import { useParams } from "react-router";

const socket = io("http://localhost:5174");

const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const Room = () => {
  const [userStream, setUserStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const myVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [remoteSocketId, setRemoteSocketId] = useState(null);

  const { roomId } = useParams();

  // peerConnection is now a ref created per component instance
  const peerConnection = useRef(new RTCPeerConnection(configuration));

  // buffer for local ICE candidates until we know remoteSocketId
  const candidateBuffer = useRef([]);

  // keep a ref to the userStream so cleanup can access latest stream
  const userStreamRef = useRef(null);

  // 1 - HANDLES CONNECTION OF ICE CANDIDATES AND RECEIVED REMOTE TRACKS
  useEffect(() => {
    const pc = peerConnection.current;

    // ICE candidates discovered locally -> buffer or send to other peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        if (remoteSocketId) {
          socket.emit("ice-candidate", {
            candidate: event.candidate,
            toId: remoteSocketId,
          });
        } else {
          // buffer until we know remoteSocketId
          candidateBuffer.current.push(event.candidate);
        }
      }
    };

    // Remote track(s) received -> set remoteStream
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      } else {
        const inboundStream = new MediaStream();
        event.track && inboundStream.addTrack(event.track);
        setRemoteStream(inboundStream);
      }
    };

    // connection state observers (useful for debugging)
    pc.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      console.log("PeerConnection state:", pc.connectionState);
    };

    return () => {
      // optional cleanup of handlers (do not close here — overall cleanup handled in unmount cleanup)
      if (peerConnection.current) {
        peerConnection.current.onicecandidate = null;
        peerConnection.current.ontrack = null;
        peerConnection.current.oniceconnectionstatechange = null;
        peerConnection.current.onconnectionstatechange = null;
      }
    };
  }, [remoteSocketId]);

  // 2 - HANDLES OFFER AND ANSWER BETWEEN PEER CANDIDATES AND OTHER SOCKET HANDLERS
  useEffect(() => {
    const handleUserJoined = async ({ first, second }) => {
      const otherId = socket.id === first ? second : first;

      setRemoteSocketId(otherId);
    };

    const handleIncomingOffer = async ({ callerOffer, from }) => {
      console.log("offer aaya hai");

      setRemoteSocketId(from);

      const pc = peerConnection.current;

      await pc.setRemoteDescription(new RTCSessionDescription(callerOffer));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("answer", { myAnswer: answer, toId: from });
      console.log("answer bhej diya");
    };

    const handleAnswer = async ({ calleeAnswer }) => {
      console.log("answer aaya hai");

      const remoteDesc = new RTCSessionDescription(calleeAnswer);
      await peerConnection.current.setRemoteDescription(remoteDesc);
    };

    const handleRemoteIce = async ({ candidate, from }) => {
      console.log("remote ICE candidate received from", from);
      try {
        await peerConnection.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (err) {
        console.error("Error adding remote ICE candidate", err);
      }
    };

    socket.emit("join-room", roomId);

    socket.on("user-joined", handleUserJoined);

    socket.on("incomingOffer", handleIncomingOffer);

    socket.on("yourAnswer", handleAnswer);

    socket.on("ice-candidate", handleRemoteIce);

    return () => {
      socket.off("user-joined", handleUserJoined);

      socket.off("incomingOffer", handleIncomingOffer);

      socket.off("yourAnswer", handleAnswer);

      socket.off("ice-candidate", handleRemoteIce);
    };
  }, [roomId]);

  // 3 - TAKE LOCAL STREAM AND ADD LOCAL TRACKS TO peerConnection
  useEffect(() => {
    const getStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        console.log(stream.getTracks());
        setUserStream(stream);
        userStreamRef.current = stream;

        // add tracks to the component-scoped peerConnection
        stream.getTracks().forEach((track) => {
          peerConnection.current.addTrack(track, stream);
        });
      } catch (err) {
        console.error("Error accessing media devices.", err);
      }
    };

    getStream();
  }, []);

  // 4 - flush buffered ICE candidates when remoteSocketId becomes available
  useEffect(() => {
    if (remoteSocketId && candidateBuffer.current.length > 0) {
      candidateBuffer.current.forEach((candidate) => {
        socket.emit("ice-candidate", { candidate, toId: remoteSocketId });
      });
      candidateBuffer.current = [];
    }
  }, [remoteSocketId]);

  // 5 - ADD USER STREAM AND REMOTE STREAM TO UI STATES USING useRef
  useEffect(() => {
    if (myVideoRef.current && userStream) {
      myVideoRef.current.srcObject = userStream;
    }

    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [userStream, remoteStream]);

  // 6 - cleanup on unmount: stop tracks, close peerConnection, inform server
  useEffect(() => {
    return () => {
      // stop local tracks
      if (userStreamRef.current) {
        try {
          userStreamRef.current.getTracks().forEach((t) => t.stop());
        } catch (e) {
          // ignore
        }
        userStreamRef.current = null;
        setUserStream(null);
      }

      // close peerConnection
      if (peerConnection.current) {
        try {
          peerConnection.current.close();
        } catch (e) {
          // ignore
        }
        peerConnection.current = null;
      }

      // notify server that we left
      try {
        socket.emit("leave-room", roomId);
      } catch (e) {
        // ignore
      }
    };
  }, [roomId]);

  const makeCall = async () => {
    console.log("offer bhej rha hun");
    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);

    socket.emit("offer", { toId: remoteSocketId, myOffer: offer });
    console.log("offer bhej diya");
  };

  return (
    <div className="min-h-screen px-20 py-15 w-screen bg-gray-400">
      <h1 className="text-center text-3xl mb-10">
        {remoteSocketId
          ? `Other User Socket Id:${remoteSocketId}`
          : `Other User Not Present`}
      </h1>

      <div>
        <h1 className="text-center text-3xl mb-10">My Stream</h1>

        {remoteSocketId && (
          <button
            className="px-5 py-2 cursor-pointer text-center border-1"
            onClick={makeCall}
          >
            CALL
          </button>
        )}

        <video
          ref={myVideoRef}
          autoPlay
          playsInline
          muted
          className="w-[640px] h-[480px] object-cover"
        />
      </div>

      <div>
        <h1 className="text-center text-3xl mb-10">Remote Stream</h1>

        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-[640px] h-[480px] object-cover"
        />
      </div>
    </div>
  );
};

export default Room;
