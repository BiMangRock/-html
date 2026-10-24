
const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'card_app',
    password: 'root',
    database: 'card_game_db'
  });

  const [rows] = await connection.query(
    'SHOW TABLES'
  );

  console.log('MySQL 연결 성공!');
  console.log('현재 테이블:', rows);

  await connection.end();
}

main().catch((error) => {
  console.error('연결 실패:', error.message);
  process.exitCode = 1;
});
