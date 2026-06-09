require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function test() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ Connection successful!");
    console.log("Timestamp:", result.rows[0]);
    await pool.end();
  } catch (err) {
    console.error("❌ Connection failed:", err.message);
  }
  process.exit();
}

test();