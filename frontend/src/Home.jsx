import React, { useState } from "react";
import { useNavigate } from "react-router";

const Home = () => {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const navigate = useNavigate();

  const handleJoin = () => {
    if (!name || !roomId) return;

    navigate(`/room/${roomId}`);
  };

  return (
    <div className="w-screen h-screen flex items-center justify-center">
      <div className="px-10 py-5 border-1 border-black rounded-sm">
        <div className="mb-10">
          <h1 className="text-3xl mb-2">Enter Name</h1>
          <input
            type="text"
            onChange={(e) => {
              setName(e.target.value);
            }}
            value={name}
            className="outline-none border-1 border-black"
          />
        </div>
        <div className="mb-10">
          <h1 className="text-3xl mb-2">Enter Room Id</h1>
          <input
            type="text"
            onChange={(e) => {
              setRoomId(e.target.value);
            }}
            value={roomId}
            className="outline-none border-1 border-black"
          />
        </div>

        <button
          onClick={handleJoin}
          className="cursor-pointer bg-sky-600 text-white text-semibold px-5 py-2 rounded-lg"
        >
          Join
        </button>
      </div>
    </div>
  );
};

export default Home;
