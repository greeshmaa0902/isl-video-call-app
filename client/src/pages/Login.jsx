import React, { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";

const Login = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] =
    useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const { data } = await axios.post(
        "http://localhost:5000/api/auth/login",
        {
          email,
          password,
        }
      );
      localStorage.setItem(
  "user",
  JSON.stringify(data.user)
);

localStorage.setItem(
  "token",
  data.token
);
      

      navigate("/dashboard");
    } catch (error) {
      console.log(error);

      alert("Login Failed");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020c2b",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          width: "400px",
          background: "#1e293b",
          padding: "40px",
          borderRadius: "20px",
        }}
      >
        <h1
          style={{
            color: "white",
            textAlign: "center",
            marginBottom: "30px",
          }}
        >
          Login
        </h1>

        <input
          type="email"
          placeholder="Enter email"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
          style={{
            width: "100%",
            padding: "15px",
            marginBottom: "20px",
            borderRadius: "10px",
            border: "none",
          }}
        />

        <input
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
          style={{
            width: "100%",
            padding: "15px",
            marginBottom: "20px",
            borderRadius: "10px",
            border: "none",
          }}
        />

        <button
          type="submit"
          style={{
            width: "100%",
            padding: "15px",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "10px",
            cursor: "pointer",
          }}
        >
          Login
        </button>

        <p
          style={{
            color: "white",
            marginTop: "20px",
            textAlign: "center",
          }}
        >
          Don’t have an account?{" "}
          <Link
            to="/signup"
            style={{
              color: "#3b82f6",
            }}
          >
            Signup
          </Link>
        </p>
      </form>
    </div>
  );
};

export default Login;