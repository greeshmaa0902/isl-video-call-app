import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import socket from "../socket";

const Dashboard = () => {
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem("user"));

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [contacts, setContacts] = useState([]);

  // LOGOUT
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    navigate("/");
  };

  // SEARCH USERS
  const handleSearch = async () => {
    try {
      const response = await axios.get(
        `http://localhost:5000/api/users/search?keyword=${search}`
      );

      setSearchResults(response.data);
    } catch (error) {
      console.log(error);
    }
  };

  // ADD CONTACT
  const handleAddContact = async (contactId) => {
    try {
      const currentUser = JSON.parse(
        localStorage.getItem("user")
      );

      // Prevent adding yourself
      if (currentUser._id === contactId) {
        alert("You cannot add yourself");
        return;
      }

      await axios.post(
        "http://localhost:5000/api/users/add-contact",
        {
          userId: currentUser._id,
          contactId: contactId,
        }
      );

      alert("Contact Added");

      fetchContacts();
    } catch (error) {
      console.log(error);
    }
  };

  // FETCH CONTACTS
  const fetchContacts = async () => {
    try {
      const currentUser = JSON.parse(
        localStorage.getItem("user")
      );

      const response = await axios.get(
        `http://localhost:5000/api/users/contacts/${currentUser._id}`
      );

      setContacts(response.data);
    } catch (error) {
      console.log(error);
    }
  };
  useEffect(() => {
  fetchContacts();

  socket.on("connect", () => {
    console.log("Connected:", socket.id);
  });

  return () => {
    socket.off("connect");
  };
}, []);



  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#0f172a",
        color: "white",
      }}
    >
      {/* SIDEBAR */}
      <div
        style={{
          width: "260px",
          background: "#1e293b",
          padding: "25px",
          borderRight: "1px solid #334155",
        }}
      >
        <h2 style={{ marginBottom: "30px" }}>
          ISL Connect
        </h2>

        <div
          style={{
            background: "#334155",
            padding: "20px",
            borderRadius: "10px",
          }}
        >
          <h3>{user?.name}</h3>

          <p>{user?.email}</p>

          <p
            style={{
              color:
                user?.mode === "isl"
                  ? "#22c55e"
                  : "#3b82f6",
            }}
          >
            {user?.mode === "isl"
              ? "ISL User"
              : "Normal User"}
          </p>
        </div>

        <button
          onClick={handleLogout}
          style={{
            marginTop: "30px",
            width: "100%",
            padding: "12px",
            background: "#ef4444",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          Logout
        </button>
      </div>

      {/* MAIN CONTENT */}
      <div
        style={{
          flex: 1,
          padding: "30px",
        }}
      >
        <h1
          style={{
            marginBottom: "30px",
          }}
        >
          Contacts
        </h1>

        {/* SEARCH BAR */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "30px",
          }}
        >
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "8px",
              border: "none",
              outline: "none",
            }}
          />

          <button
            onClick={handleSearch}
            style={{
              padding: "12px 20px",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </div>

        {/* SEARCH RESULTS */}
        {searchResults.length > 0 && (
          <div
            style={{
              marginBottom: "30px",
            }}
          >
            <h2>Search Results</h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(250px, 1fr))",
                gap: "20px",
                marginTop: "20px",
              }}
            >
              {searchResults.map((result) => (
                <div
                  key={result._id}
                  style={{
                    background: "#334155",
                    padding: "20px",
                    borderRadius: "12px",
                  }}
                >
                  <h3>{result.name}</h3>

                  <p>{result.email}</p>

                  <p>
                    {result.mode === "isl"
                      ? "ISL User"
                      : "Normal User"}
                  </p>
                  {result._id !== user._id &&
                    !contacts.some(
                      (contact) => contact._id === result._id
                    ) && (
                      
                  
                    <button
                      onClick={() =>
                        handleAddContact(result._id)
                      }
                      style={{
                        marginTop: "10px",
                        width: "100%",
                        padding: "10px",
                        background: "#22c55e",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        cursor: "pointer",
                      }}
                    >
                      Add Contact
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CONTACTS */}
        <h2 style={{ marginBottom: "20px" }}>
          My Contacts
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "20px",
          }}
        >
          {contacts.map((contact) => (
            <div
              key={contact._id}
              style={{
                background: "#1e293b",
                padding: "20px",
                borderRadius: "12px",
              }}
            >
              <h2>{contact.name}</h2>

              <p>{contact.email}</p>
              <button
  onClick={() => navigate("/call")}
  style={{
    marginTop: "15px",
    width: "100%",
    padding: "10px",
    background: "#3b82f6",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  }}
>
  Start Call
</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;