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


//관리자 미들웨어
function adminMiddleware(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ message: '로그인이 필요합니다.' });
    }
    if (!req.session.user.is_admin) {
        return res.status(403).json({ message: '관리자만 접근 가능합니다.' });
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

    if (!name || !email || !password || !birth) {
        return res.status(400).json({ message: '필수 항목을 입력해주세요.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const lowerEmail = email.toLowerCase();

        connection.query(
            'INSERT INTO MEMBER (name, email, password, phone, birth_date, join_date) VALUES (?, ?, ?, ?, ?, NOW())',
            [name, lowerEmail, hashedPassword, phone, birth],
            (err) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: '이미 가입된 이메일입니다.' });
                    console.error(err);
                    return res.status(500).json({ message: 'DB 저장 실패' });
                }
                res.status(201).json({ message: '회원가입 성공!' });
            }
        );
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: '서버 오류' });
    }
});

//로그인
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const lowerEmail = email.toLowerCase();

    connection.query('SELECT * FROM MEMBER WHERE email = ?', [lowerEmail], async (err, results) => {
        if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
        if (results.length === 0) return res.status(401).json({ message: '존재하지 않는 이메일입니다.' });

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: '비밀번호가 틀렸습니다.' });

        req.session.user = { id: user.MENBER_id, name: user.name, email: user.email, is_admin: user.is_admin };
        res.json({ message: '로그인 성공', name: user.name, is_admin: user.is_admin });
    });
});

//내 정보 조회
app.get('/userinfo', authMiddleware, (req, res) => {
    connection.query(
        'SELECT MENBER_id, name, email, phone, birth_date, join_date, is_admin FROM MEMBER WHERE MENBER_id = ?',
        [req.user.id],
        (err, results) => {
            if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
            if (results.length === 0) return res.status(404).json({ message: '사용자 없음' });
            res.json(results[0]);
        }
    );
});

//회원 정보 수정
app.put('/user/:id', authMiddleware, (req, res) => {
    const { name, phone } = req.body;
    if (parseInt(req.params.id) !== req.user.id) return res.status(403).json({ message: '권한 없음' });

    connection.query('UPDATE MEMBER SET name = ?, phone = ? WHERE MENBER_id = ?', [name, phone, req.params.id], (err) => {
        if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
        req.session.user.name = name;
        res.json({ message: '회원 정보 수정 완료' });
    });
});

//회원 탈퇴
app.delete('/user/:id', authMiddleware, (req, res) => {
    if (parseInt(req.params.id) !== req.user.id) return res.status(403).json({ message: '권한 없음' });

    connection.query('DELETE FROM MEMBER WHERE MENBER_id = ?', [req.params.id], (err) => {
        if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
        req.session.destroy(() => res.json({ message: '회원 탈퇴 완료' }));
    });
});

//로그아웃
app.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ message: '로그아웃 완료' }));
});

//영화 등록
app.post('/movie', adminMiddleware, (req, res) => {
    const { title, genre, duration_min, rating, release_date } = req.body;

    connection.query(
        'INSERT INTO MOVIE (title, genre, duration_min, rating, release_date) VALUES (?, ?, ?, ?, ?)',
        [title, genre, duration_min, rating, release_date],
        (err, result) => {
            if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
            res.status(201).json({ message: '영화 등록 완료', movieId: result.insertId });
        }
    );
});

//영화 전체 조회
app.get('/movies', (req, res) => {
    connection.query('SELECT * FROM MOVIE ORDER BY release_date DESC', (err, results) => {
        if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
        res.json(results);
    });
});

//영화 단건 조회
app.get('/movie/:id', (req, res) => {
    connection.query('SELECT * FROM MOVIE WHERE movie_id = ?', [req.params.id], (err, results) => {
        if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
        if (results.length === 0) return res.status(404).json({ message: '영화 없음' });
        res.json(results[0]);
    });
});

//영화 수정
app.put('/movie/:id', adminMiddleware, (req, res) => {
    const { title, genre, duration_min, rating, release_date } = req.body;

    connection.query(
        'UPDATE MOVIE SET title=?, genre=?, duration_min=?, rating=?, release_date=? WHERE movie_id=?',
        [title, genre, duration_min, rating, release_date, req.params.id],
        (err) => {
            if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
            res.json({ message: '영화 수정 완료' });
        }
    );
});

//영화 삭제
app.delete('/movie/:id', adminMiddleware, (req, res) => {
    connection.query('DELETE FROM MOVIE WHERE movie_id = ?', [req.params.id], (err) => {
        if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
        res.json({ message: '영화 삭제 완료' });
    });
});

//상영관 전체 조회
app.get('/theaters', (req, res) => {
    connection.query('SELECT * FROM THEATER', (err, results) => {
        if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
        res.json(results);
    });
});

//상영관 등록
app.post('/theater', adminMiddleware, (req, res) => {
    const { theater_name, total_seats } = req.body;

    connection.query(
        'INSERT INTO THEATER (theater_name, total_seats) VALUES (?, ?)',
        [theater_name, total_seats],
        (err, result) => {
            if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
            res.status(201).json({ message: '상영관 등록 완료', theaterId: result.insertId });
        }
    );
});

//상영관 수정
app.put('/theater/:id', adminMiddleware, (req, res) => {
    const { theater_name, total_seats } = req.body;

    connection.query(
        'UPDATE THEATER SET theater_name=?, total_seats=? WHERE theater_id=?',
        [theater_name, total_seats, req.params.id],
        (err) => {
            if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
            res.json({ message: '상영관 수정 완료' });
        }
    );
});

//상영관 삭제
app.delete('/theater/:id', adminMiddleware, (req, res) => {
    connection.query('DELETE FROM THEATER WHERE theater_id = ?', [req.params.id], (err) => {
        if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
        res.json({ message: '상영관 삭제 완료' });
    });
});

//상영일정 등록
app.post('/schedule', adminMiddleware, (req, res) => {
    const { movie_id, theater_id, show_time, available_seats } = req.body;

    connection.query(
        'INSERT INTO SCHEDULE (movie_id, theater_id, show_time, available_seats) VALUES (?, ?, ?, ?)',
        [movie_id, theater_id, show_time, available_seats],
        (err, result) => {
            if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
            res.status(201).json({ message: '상영일정 등록 완료', scheduleId: result.insertId });
        }
    );
});

//상영일정 조회
app.get('/schedules', (req, res) => {
    const { movie_id } = req.query;

    let sql = `
        SELECT s.schedule_id, s.movie_id, s.theater_id, s.show_time, s.available_seats,
               m.title, m.duration_min, m.rating,
               t.theater_name, t.total_seats
        FROM SCHEDULE s
        JOIN MOVIE m ON s.movie_id = m.movie_id
        JOIN THEATER t ON s.theater_id = t.theater_id
        WHERE 1=1
    `;
    const params = [];

    if (movie_id) { sql += ' AND s.movie_id = ?'; params.push(movie_id); }
    sql += ' ORDER BY s.show_time';

    connection.query(sql, params, (err, results) => {
        if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
        res.json(results);
    });
});

//상영일정 수정
app.put('/schedule/:id', adminMiddleware, (req, res) => {
    const { movie_id, theater_id, show_time, available_seats } = req.body;

    connection.query(
        'UPDATE SCHEDULE SET movie_id=?, theater_id=?, show_time=?, available_seats=? WHERE schedule_id=?',
        [movie_id, theater_id, show_time, available_seats, req.params.id],
        (err) => {
            if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
            res.json({ message: '상영일정 수정 완료' });
        }
    );
});

//상영일정 삭제
app.delete('/schedule/:id', adminMiddleware, (req, res) => {
    connection.query('DELETE FROM SCHEDULE WHERE schedule_id = ?', [req.params.id], (err) => {
        if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
        res.json({ message: '상영일정 삭제 완료' });
    });
});

//특정 상영일정 예매된 좌석 조회
app.get('/booked-seats/:scheduleId', (req, res) => {
    connection.query(
        "SELECT seat_number FROM booking WHERE schedule_id = ? AND status != '취소'",
        [req.params.scheduleId],
        (err, results) => {
            if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
            res.json(results.map(r => String(r.seat_number)));
        }
    );
});

//예매 등록
app.post('/booking', authMiddleware, (req, res) => {
    const { schedule_id, seat_number } = req.body;
    const member_id = req.user.id;

    if (!schedule_id || !seat_number) {
        return res.status(400).json({ message: '좌석을 선택해주세요.' });
    }

    // 이미 예매된 좌석 체크
    connection.query(
        `SELECT booking_id FROM BOOKING WHERE schedule_id = ? AND seat_number = ? AND status != '취소'`,
        [schedule_id, seat_number],
        (err, taken) => {
            if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
            if (taken.length > 0) return res.status(409).json({ message: '이미 예매된 좌석입니다.' });

            connection.query(
                'INSERT INTO BOOKING (member_id, schedule_id, seat_number, status) VALUES (?, ?, ?, ?)',
                [member_id, schedule_id, seat_number, 'confirmed'],
                (err, result) => {
                    if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }

                    connection.query(
                        'UPDATE SCHEDULE SET available_seats = available_seats - 1 WHERE schedule_id = ?',
                        [schedule_id],
                        (err) => {
                            if (err) console.error(err);
                        }
                    );

                    res.status(201).json({ message: '예매 완료!', bookingId: result.insertId });
                }
            );
        }
    );
});

//내 예매 내역
app.get('/bookings', authMiddleware, (req, res) => {
    connection.query(
        `SELECT b.booking_id, b.seat_number, b.status, b.booked_at,
                m.title, m.duration_min,
                s.show_time, s.schedule_id,
                t.theater_name
         FROM BOOKING b
         JOIN SCHEDULE s ON b.schedule_id = s.schedule_id
         JOIN MOVIE m ON s.movie_id = m.movie_id
         JOIN THEATER t ON s.theater_id = t.theater_id
         WHERE b.member_id = ?
         ORDER BY b.booked_at DESC`,
        [req.user.id],
        (err, results) => {
            if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
            res.json(results);
        }
    );
});

//전체 예매 내역 (관리자)
app.get('/admin/bookings', adminMiddleware, (req, res) => {
    connection.query(
        `SELECT b.booking_id, b.seat_number, b.status, b.booked_at,
                mem.name as member_name,
                m.title,
                s.show_time,
                t.theater_name
         FROM BOOKING b
         JOIN MEMBER mem ON b.member_id = mem.MENBER_id
         JOIN SCHEDULE s ON b.schedule_id = s.schedule_id
         JOIN MOVIE m ON s.movie_id = m.movie_id
         JOIN THEATER t ON s.theater_id = t.theater_id
         ORDER BY b.booked_at DESC`,
        (err, results) => {
            if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
            res.json(results);
        }
    );
});

//예매 취소
app.delete('/booking/:id', authMiddleware, (req, res) => {
    connection.query(
        'SELECT * FROM BOOKING WHERE booking_id = ? AND member_id = ?',
        [req.params.id, req.user.id],
        (err, results) => {
            if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }
            if (results.length === 0) return res.status(404).json({ message: '예매 내역 없음 또는 권한 없음' });

            const booking = results[0];

            connection.query(
                "UPDATE BOOKING SET status = '취소' WHERE booking_id = ?",
                [req.params.id],
                (err) => {
                    if (err) { console.error(err); return res.status(500).json({ message: 'DB 오류' }); }

                    connection.query(
                        'UPDATE SCHEDULE SET available_seats = available_seats + 1 WHERE schedule_id = ?',
                        [booking.schedule_id],
                        (err) => { if (err) console.error(err); }
                    );

                    res.json({ message: '예매 취소 완료' });
                }
            );
        }
    );
});

//서버 시작
app.listen(port, () => {
    console.log(`서버 실행 중: http://localhost:${port}`);
});