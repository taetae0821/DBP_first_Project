const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'your_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 2 }
}));

//DB 연결
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'DB_first'
});

connection.connect(err => {
    if (err) { console.error('DB 연결 실패:', err); return; }
    console.log('DB 연결 성공');
});

//인증 미들웨어
function authMiddleware(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ message: '로그인이 필요합니다.' });
    }
    req.user = req.session.user;
    next();
}

//페이지
app.get('/', (req, res) => res.redirect('/index'));
app.get('/index', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

//회원가입
app.post('/user', async (req, res) => {
    const { name, email, password, phone, birth } = req.body;

    if (!name || !email || !password || !phone || !birth) {
        return res.status(400).json({ message: '모든 필드를 입력해주세요.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        connection.query(
            'INSERT INTO MEMBER (name, email, password, phone, birth_date, join_date) VALUES (?, ?, ?, ?, ?, NOW())',
            [name, email, hashedPassword, phone, birth],
            (err) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: '이미 가입된 이메일입니다.' });
                    return res.status(500).json({ message: 'DB 저장 실패' });
                }
                res.status(201).json({ message: '회원가입 성공!' });
            }
        );
    } catch (e) {
        res.status(500).json({ message: '서버 오류' });
    }
});

//로그인
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    connection.query('SELECT * FROM MEMBER WHERE email = ?', [email], async (err, results) => {
        if (err) return res.status(500).json({ message: 'DB 오류' });
        if (results.length === 0) return res.status(401).json({ message: '존재하지 않는 이메일입니다.' });

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: '비밀번호가 틀렸습니다.' });

        req.session.user = { id: user.id, name: user.name, email: user.email };
        res.json({ message: '로그인 성공', name: user.name });
    });
});

//내 정보 조회
app.get('/userinfo', authMiddleware, (req, res) => {
    connection.query(
        'SELECT id, name, email, phone, birth_date, join_date FROM MEMBER WHERE id = ?',
        [req.user.id],
        (err, results) => {
            if (err) return res.status(500).json({ message: 'DB 오류' });
            if (results.length === 0) return res.status(404).json({ message: '사용자 없음' });
            res.json(results[0]);
        }
    );
});

//회원 정보 수정
app.put('/user/:id', authMiddleware, (req, res) => {
    const { name, phone } = req.body;
    if (parseInt(req.params.id) !== req.user.id) return res.status(403).json({ message: '권한 없음' });

    connection.query('UPDATE MEMBER SET name = ?, phone = ? WHERE id = ?', [name, phone, req.params.id], (err) => {
        if (err) return res.status(500).json({ message: 'DB 오류' });
        req.session.user.name = name;
        res.json({ message: '회원 정보 수정 완료' });
    });
});

//회원 탈퇴
app.delete('/user/:id', authMiddleware, (req, res) => {
    if (parseInt(req.params.id) !== req.user.id) return res.status(403).json({ message: '권한 없음' });

    connection.query('DELETE FROM MEMBER WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ message: 'DB 오류' });
        req.session.destroy(() => res.json({ message: '회원 탈퇴 완료' }));
    });
});

//로그아웃
app.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ message: '로그아웃 완료' }));
});

//영화 등록
app.post('/movie', authMiddleware, (req, res) => {
    const { title, genre, duration, rating, release_date, status } = req.body;

    connection.query(
        'INSERT INTO MOVIE (title, genre, duration, rating, release_date, status) VALUES (?, ?, ?, ?, ?, ?)',
        [title, genre, duration, rating, release_date, status || '상영중'],
        (err, result) => {
            if (err) return res.status(500).json({ message: 'DB 오류' });
            res.status(201).json({ message: '영화 등록 완료', movieId: result.insertId });
        }
    );
});

//영화 전체 조회
app.get('/movies', (req, res) => {
    connection.query('SELECT * FROM MOVIE ORDER BY release_date DESC', (err, results) => {
        if (err) return res.status(500).json({ message: 'DB 오류' });
        res.json(results);
    });
});

//영화 단건 조회
app.get('/movie/:id', (req, res) => {
    connection.query('SELECT * FROM MOVIE WHERE id = ?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ message: 'DB 오류' });
        if (results.length === 0) return res.status(404).json({ message: '영화 없음' });
        res.json(results[0]);
    });
});

//영화 수정
app.put('/movie/:id', authMiddleware, (req, res) => {
    const { title, genre, duration, rating, release_date, status } = req.body;

    connection.query(
        'UPDATE MOVIE SET title=?, genre=?, duration=?, rating=?, release_date=?, status=? WHERE id=?',
        [title, genre, duration, rating, release_date, status, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ message: 'DB 오류' });
            res.json({ message: '영화 정보 수정 완료' });
        }
    );
});

//영화 삭제
app.delete('/movie/:id', authMiddleware, (req, res) => {
    connection.query('DELETE FROM MOVIE WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ message: 'DB 오류' });
        res.json({ message: '영화 삭제 완료' });
    });
});

//상영일정 등록
app.post('/schedule', authMiddleware, (req, res) => {
    const { movie_id, theater, screen_date, screen_time, total_seats } = req.body;

    connection.query(
        'INSERT INTO SCHEDULE (movie_id, theater, screen_date, screen_time, total_seats, available_seats) VALUES (?, ?, ?, ?, ?, ?)',
        [movie_id, theater, screen_date, screen_time, total_seats, total_seats],
        (err, result) => {
            if (err) return res.status(500).json({ message: 'DB 오류' });
            res.status(201).json({ message: '상영 일정 등록 완료', scheduleId: result.insertId });
        }
    );
});

//상영일정 조회
app.get('/schedules', (req, res) => {
    const { movie_id, date } = req.query;
    let sql = 'SELECT s.*, m.title, m.duration FROM SCHEDULE s JOIN MOVIE m ON s.movie_id = m.id WHERE 1=1';
    const params = [];

    if (movie_id) { sql += ' AND s.movie_id = ?'; params.push(movie_id); }
    if (date)     { sql += ' AND s.screen_date = ?'; params.push(date); }
    sql += ' ORDER BY s.screen_date, s.screen_time';

    connection.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ message: 'DB 오류' });
        res.json(results);
    });
});

//상영일정 수정
app.put('/schedule/:id', authMiddleware, (req, res) => {
    const { theater, screen_date, screen_time, total_seats } = req.body;

    connection.query(
        'UPDATE SCHEDULE SET theater=?, screen_date=?, screen_time=?, total_seats=? WHERE id=?',
        [theater, screen_date, screen_time, total_seats, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ message: 'DB 오류' });
            res.json({ message: '상영 일정 수정 완료' });
        }
    );
});

//상영일정 삭제
app.delete('/schedule/:id', authMiddleware, (req, res) => {
    connection.query('DELETE FROM SCHEDULE WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ message: 'DB 오류' });
        res.json({ message: '상영 일정 삭제 완료' });
    });
});

//좌석 조회
app.get('/seats/:scheduleId', (req, res) => {
    connection.query(
        'SELECT * FROM SEAT WHERE schedule_id = ? ORDER BY seat_number',
        [req.params.scheduleId],
        (err, results) => {
            if (err) return res.status(500).json({ message: 'DB 오류' });
            res.json(results);
        }
    );
});

//예매 등록
app.post('/booking', authMiddleware, (req, res) => {
    const { schedule_id, seat_numbers } = req.body;
    const member_id = req.user.id;

    if (!schedule_id || !seat_numbers || seat_numbers.length === 0) {
        return res.status(400).json({ message: '좌석을 선택해주세요.' });
    }

    connection.beginTransaction(err => {
        if (err) return res.status(500).json({ message: 'DB 오류' });

        connection.query(
            `SELECT seat_number FROM BOOKING WHERE schedule_id = ? AND seat_number IN (?) AND status != '취소'`,
            [schedule_id, seat_numbers],
            (err, taken) => {
                if (err) return connection.rollback(() => res.status(500).json({ message: 'DB 오류' }));
                if (taken.length > 0) {
                    const takenSeats = taken.map(r => r.seat_number).join(', ');
                    return connection.rollback(() => res.status(409).json({ message: `이미 예매된 좌석입니다: ${takenSeats}` }));
                }

                const bookingRows = seat_numbers.map(seat => [member_id, schedule_id, seat, 'confirmed', new Date()]);
                connection.query('INSERT INTO BOOKING (member_id, schedule_id, seat_number, status, booked_at) VALUES ?', [bookingRows], (err) => {
                    if (err) return connection.rollback(() => res.status(500).json({ message: 'DB 오류' }));

                    connection.query(
                        'UPDATE SCHEDULE SET available_seats = available_seats - ? WHERE id = ?',
                        [seat_numbers.length, schedule_id],
                        (err) => {
                            if (err) return connection.rollback(() => res.status(500).json({ message: 'DB 오류' }));
                            connection.commit(err => {
                                if (err) return connection.rollback(() => res.status(500).json({ message: 'DB 오류' }));
                                res.status(201).json({ message: '예매 완료!' });
                            });
                        }
                    );
                });
            }
        );
    });
});

//내 예매 내역
app.get('/bookings', authMiddleware, (req, res) => {
    connection.query(
        `SELECT b.*, m.title, s.screen_date, s.screen_time, s.theater
         FROM BOOKING b
         JOIN SCHEDULE s ON b.schedule_id = s.id
         JOIN MOVIE m ON s.movie_id = m.id
         WHERE b.member_id = ?
         ORDER BY b.booked_at DESC`,
        [req.user.id],
        (err, results) => {
            if (err) return res.status(500).json({ message: 'DB 오류' });
            res.json(results);
        }
    );
});

//전체 예매 내역 (관리자)
app.get('/admin/bookings', authMiddleware, (req, res) => {
    connection.query(
        `SELECT b.*, mem.name as member_name, m.title, s.screen_date, s.screen_time, s.theater
         FROM BOOKING b
         JOIN MEMBER mem ON b.member_id = mem.id
         JOIN SCHEDULE s ON b.schedule_id = s.id
         JOIN MOVIE m ON s.movie_id = m.id
         ORDER BY b.booked_at DESC`,
        (err, results) => {
            if (err) return res.status(500).json({ message: 'DB 오류' });
            res.json(results);
        }
    );
});

//예매 취소
app.delete('/booking/:id', authMiddleware, (req, res) => {
    connection.query('SELECT * FROM BOOKING WHERE id = ? AND member_id = ?', [req.params.id, req.user.id], (err, results) => {
        if (err) return res.status(500).json({ message: 'DB 오류' });
        if (results.length === 0) return res.status(404).json({ message: '예매 내역 없음 또는 권한 없음' });

        const booking = results[0];
        connection.beginTransaction(err => {
            if (err) return res.status(500).json({ message: 'DB 오류' });

            connection.query('UPDATE BOOKING SET status = ? WHERE id = ?', ['취소', req.params.id], (err) => {
                if (err) return connection.rollback(() => res.status(500).json({ message: 'DB 오류' }));

                connection.query('UPDATE SCHEDULE SET available_seats = available_seats + 1 WHERE id = ?', [booking.schedule_id], (err) => {
                    if (err) return connection.rollback(() => res.status(500).json({ message: 'DB 오류' }));
                    connection.commit(err => {
                        if (err) return connection.rollback(() => res.status(500).json({ message: 'DB 오류' }));
                        res.json({ message: '예매 취소 완료' });
                    });
                });
            });
        });
    });
});

//서버 시작
app.listen(port, () => {
    console.log(`서버 실행 중: http://localhost:${port}`);
});