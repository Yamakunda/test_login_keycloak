const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken'); // Dùng để decode token lấy thông tin
const jwksClient = require('jwks-rsa');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Kết nối Postgres (đã port-forward từ k8s)
const pool = new Pool({
  user: 'keycloak_user',
  host: 'localhost',
  database: 'ccc',
  password: 'keycloak_password',
  port: 5432,
});

const client = jwksClient({
  jwksUri: 'http://keycloak.local.com/realms/SNP/protocol/openid-connect/certs', // Thay URL và realm của bạn vào đây
  cache: true,             // Nên bật cache để đỡ phải gọi Keycloak liên tục
  rateLimit: true,
  jwksRequestsPerMinute: 5 // Giới hạn số lần gọi lấy key
});
// Hàm hỗ trợ để lấy key ký (signing key) dựa trên header của token
function getKey(header, callback) {
  client.getSigningKey(header.kid, function (err, key) {
    if (err) {
      return callback(err, null);
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}
// 2. Middleware Verify Signature (BẢO MẬT CAO)
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send('Access Denied: No Token Provided!');
  }

  const token = authHeader.split(' ')[1]; // Lấy phần chuỗi sau "Bearer "

  // Hàm verify của thư viện jsonwebtoken sẽ làm 3 việc:
  // a. Gọi hàm getKey để lấy Public Key từ Keycloak về.
  // b. Dùng Public Key để giải mã Signature -> so khớp xem có đúng không.
  // c. Kiểm tra hạn sử dụng (exp) của token.
  jwt.verify(token, getKey, { 
      algorithms: ['RS256'] // Keycloak mặc định dùng thuật toán RS256
  }, (err, decoded) => {
    if (err) {
      console.error("Lỗi verify token:", err.message);
      return res.status(403).send('Invalid Token');
    }

    // Nếu verify thành công, lưu thông tin user vào request để dùng ở bước sau
    req.userKeycloak = decoded;
    next();
  });
};

// 2. API Đăng nhập / Đồng bộ User
app.post('/api/login-sync', verifyToken, async (req, res) => {
  const { sub, email, name } = req.userKeycloak; // sub chính là Keycloak ID

  try {
    // Bước A: Kiểm tra xem user này đã có trong DB của mình chưa
    const checkUser = await pool.query(
      'SELECT * FROM users WHERE keycloak_id = $1', 
      [sub]
    );

    if (checkUser.rows.length > 0) {
      // TRƯỜNG HỢP 1: User cũ -> Trả về dữ liệu luôn
      console.log('User cũ đã quay lại:', email);
      return res.json({
        status: 'existing_user',
        data: checkUser.rows[0]
      });
    } else {
      // TRƯỜNG HỢP 2: User mới -> Tạo mới (JIT Provisioning)
      console.log('User mới, đang tạo DB...', email);
      const newUser = await pool.query(
        'INSERT INTO users (keycloak_id, email, full_name, wallet_balance) VALUES ($1, $2, $3, $4) RETURNING *',
        [sub, email, name, 1000] // Tặng luôn 1000 tiền làm quà
      );
      
      return res.json({
        status: 'new_created',
        data: newUser.rows[0]
      });
    }

  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

app.listen(5000, () => console.log('Backend running on port 5000'));