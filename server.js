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
    const { name, email, password, phone, birth } = req.body;

    console.log(req.body);

    const sql = `
    INSERT INTO MEMBER
    (name, email, password, phone, birth_date, join_date)
    VALUES (?, ?, ?, ?, ?, NOW())
`;

    connection.query(
        sql,
        [name, email, password, phone, birth],
        (err, result) => {
            if (err) {

                if (err.code === 'ER_DUP_ENTRY') {
                return res.send('이미 가입된 이메일입니다.');
        }

                console.error(err);
                return res.status(500).send('DB 저장 실패');
            }
            if(email.indexOf("gmail.com") || email.indexOf("naver.com") || email.indexOf("daum.net") || email.indexOf("@")){
                 console.log('DB 저장 성공');
                 alert("회원가입 성공!");
            res.redirect('/login.html');
            }else{
                res.send('이메일 형식이 잘못되었습니다');
            }
        }
    );
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    connection.query(
        'SELECT * FROM MEMBER WHERE email = ?',
        [email],
        (err, results) => {
            if (err) {
                return res.status(500).send('DB 오류');
            }

            if (results.length === 0) {
                return res.status(401).send('존재하지 않는 이메일입니다.');
            }

            const user = results[0];

            if (user.password !== password) {
                return res.status(401).send('비밀번호가 틀렸습니다.');
            }
            console.log("로그인 성공!");
            res.redirect('/index.html'); 
        }
    );
});

app.get('/userinfo', (req, res) => {
    if (!req.session.user) {
        return res.json({ loggedIn: false });
    }

    res.json({
        loggedIn: true,
        name: req.session.user.name
    });
});

app.listen(3000);