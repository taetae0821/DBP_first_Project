const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

const connection = mysql.createConnection({
    host : 'localhost',
    user : 'root',
    password : 'wlsdl0024.',
    database : 'DB_first'
});

connection.connect(err => {
  if (err) {
    console.error('DB 연결 실패:', err);
    return;
  }
  console.log('DB 연결 성공');
});

app.get('/', (req, res) => {
    res.redirect('/index');
});

app.get('/index', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/user', (req, res) => {
    const { name, email, phone, birth } = req.body;

    console.log(req.body);

    const sql = `
        INSERT INTO MEMBER
        (name, email, phone, birth_date, join_date)
        VALUES (?, ?, ?, ?, NOW())
    `;

    connection.query(
        sql,
        [name, email, phone, birth],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('DB 저장 실패');
            }

            console.log('DB 저장 성공');
            res.send('DB 저장 성공');
        }
    );
});



app.listen(3000);