import React, { useState, useEffect, useRef } from "react";
import {Routes,Route} from "react-router"
import Home from "./Home";
import Room from "./Room";

const App = () => {
    return(
      <div className="min-h-screen bg-gray-400">
      <Routes>
      <Route path="/" element={<Home/>}></Route>
      <Route path="/room/:roomId" element={<Room/>}></Route>
    </Routes>
    </div>
    )
};

export default App;
