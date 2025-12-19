import React, { useState, useEffect, useRef } from "react";
import Keycloak from "keycloak-js";
import axios from "axios";

// Cấu hình Keycloak
const keycloakConfig = {
  url: "http://keycloak.local.com", // URL Keycloak của bạn
  realm: "SNP",
  clientId: "ccc",
};

function App() {
  const [userInfo, setUserInfo] = useState(null); // Thông tin từ Backend (Postgres)
  const [kc, setKc] = useState(null);
  const isRun = useRef(false); // Fix lỗi React 18 render 2 lần

  useEffect(() => {
    if (isRun.current) return;
    isRun.current = true;

    const keycloak = new Keycloak(keycloakConfig);

    // 1. Khởi tạo Keycloak
    keycloak
      .init({ onLoad: "login-required" }) // Bắt buộc đăng nhập mới vào dc
      .then((authenticated) => {
        setKc(keycloak);
        if (authenticated) {
          console.log("Đã đăng nhập Keycloak! Token:", keycloak.token);
          
          // 2. GỌI BACKEND ĐỂ ĐỒNG BỘ USER
          syncUserWithBackend(keycloak.token);
        }
      });
  }, []);

  const syncUserWithBackend = async (token) => {
    try {
      const res = await axios.post(
        "http://localhost:5000/api/login-sync",
        {}, // Body rỗng
        {
          headers: {
            Authorization: `Bearer ${token}`, // Gửi kèm Token
          },
        }
      );
      // Set dữ liệu trả về từ Postgres
      setUserInfo(res.data);
    } catch (error) {
      console.error("Lỗi sync backend:", error);
    }
  };

  if (!userInfo) return <div>Đang tải và đồng bộ dữ liệu...</div>;

  return (
    <div style={{ padding: "50px" }}>
      <h1>Chào mừng, {userInfo.data.full_name}</h1>
      
      <div style={{ border: "1px solid #ccc", padding: "20px" }}>
        <h3>Thông tin từ App Database (Postgres):</h3>
        <p><strong>Database ID:</strong> {userInfo.data.id}</p>
        <p><strong>Keycloak ID:</strong> {userInfo.data.keycloak_id}</p>
        <p><strong>Email:</strong> {userInfo.data.email}</p>
        <p><strong>Số dư ví:</strong> {userInfo.data.wallet_balance} VND</p>
        <p><strong>Trạng thái:</strong> {userInfo.status === 'new_created' ? 'Bạn là người mới!' : 'Khách quen quay lại'}</p>
      </div>

      <button onClick={() => kc.logout()}>Đăng xuất</button>
    </div>
  );
}

export default App;