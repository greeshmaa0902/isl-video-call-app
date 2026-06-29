import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";

const Signup = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
  name: "",
  email: "",
  password: "",
  mode: "",
});
const handleChange = (e) => {
  setFormData({
    ...formData,
    [e.target.name]: e.target.value,
  });
};
const handleSignup = async () => {
  try {
    const response = await axios.post(
      "http://localhost:5000/api/auth/register",
      formData
    );

    // Save token
    localStorage.setItem("token", response.data.token);

    alert("Signup Successful");

    navigate("/");
  } catch (error) {
    console.log(error);

    alert(error.response.data.message);
  }
};
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#0f172a",
      }}
    >
      <div
        style={{
          background: "#1e293b",
          padding: "40px",
          borderRadius: "10px",
          width: "350px",
          color: "white",
        }}
      >
        <h1 style={{ textAlign: "center" }}>Signup</h1>

        <input
            type="text"
            placeholder="Enter name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            style={inputStyle}
        />
          <input
            type="email"
            placeholder="Enter email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            style={inputStyle}
          />
        

        <input
          type="password"
          placeholder="Enter password"
          name="password"
          value={formData.password}
          onChange={handleChange}
          style={inputStyle}
        />

        <select
        name="mode"
        value={formData.mode}
        onChange={handleChange}
        style={inputStyle}
        >
        <option value="">Select Mode</option>
        <option value="isl">ISL User</option>
        <option value="normal">Normal User</option>
        </select>

        <button style={buttonStyle} onClick={handleSignup}>
          Signup
        </button>
        <p style={{ marginTop: "15px", textAlign: "center" }}>
           Already have an account?{" "}
          <Link
            to="/"
            style={{
               color: "#3b82f6",
               textDecoration: "none",
          }}
         > 
         Login
          </Link>
        </p>
      </div>
    </div>
  );
};


const inputStyle = {
  width: "100%",
  padding: "12px",
  marginTop: "15px",
  borderRadius: "5px",
  border: "none",
};

const buttonStyle = {
  width: "100%",
  padding: "12px",
  marginTop: "20px",
  background: "#3b82f6",
  color: "white",
  border: "none",
  borderRadius: "5px",
  cursor: "pointer",
};

export default Signup;