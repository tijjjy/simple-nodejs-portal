var express = require('express');
var app = express();
var bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const cookieParser = require('cookie-parser');
const sessions = require('express-session');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const flash = require('connect-flash');
const os = require('os');

app.set('view engine', 'ejs');
app.use(flash());

let db = new sqlite3.Database('./testdb.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the database.');
});

db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password TEXT NOT NULL);` , (err) => {
    if (err) {
        console.log(err.name)
    }});

/* db.run(`INSERT INTO test (id, username, password) VALUES (23, 'test', 'test');`, (err) => {
    if(err) {
        console.log(err.name)
    };
}) */

db.all("SELECT * FROM users", (err, data) => {
    console.log(data)
})

// Create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false });
app.use(cookieParser());

var sessionData;
app.use(sessions({
    secret: "hehe",
    saveUninitialized:true,
    cookie: { maxAge: 3600000 },
    resave: false,
    SameSite: "None",
    Secure: false
}));

app.use(express.static('views'));
app.get('/', function(req, res) {
    sessionData = req.session

    //Checks if login failed and outputs Login Failed
    if (sessionData.login_status === "Login failed") {
        sessionData.login_status = null
        return res.render('login.ejs', {login_failed: "Login failed"});
    }

    //Checks if user has no token
    if (!req.cookies.token) {
        return res.render('login.ejs')
    }

    //Validates users token
    validate(req.cookies.token).then((response) => {
        if (response.data === "Valid token") {
            return res.redirect(302, "/home")
        } else {
            return res.render('login.ejs')
        }
    })

})

app.get('/register', function(req, res) {
    sessionData = req.session

    if (sessionData.error === "passwordtooshort" && sessionData.error2 === "usernametaken") {
        sessionData.error = null
        sessionData.error2 = null
        return res.render('register', {usernametaken: "Username already exists"})
    } else if (sessionData.error === "passwordtooshort") {
        sessionData.error = null
        return res.render('register', {passwordtooshort: "Password too short"})
    } else if (sessionData.error2 === "usernametaken") {
        sessionData.error2 = null
        return res.render('register', {usernametaken: "Username already exists"})
    }

    return res.render('register')
})

app.post('/register', urlencodedParser, async function (req, res) {
    sessionData = req.session
    var query = `INSERT INTO users (username, password) VALUES ('${req.body.username}', '${req.body.password}')`;
    var check = `SELECT username FROM users WHERE username = '${req.body.username}'`;
    if (req.body.password) {
        if (req.body.password.length < 3) {
            sessionData.error = "passwordtooshort"
        }
    }
    db.get(check, (err, data) => {
        if (err) {
            console.log(err)
        }
        if (data) {
            sessionData.error2 = "usernametaken"
            return res.redirect(302, "/register")
        } else if (sessionData.error === "passwordtooshort") {
            return res.redirect(302, "/register")
        } else {
            db.run(query, (err, data) => {
                if (err) {
                    console.log(err)
                }
                    console.log("Registration Successful login for username " + req.body.username)
                    sessionData.username = req.body.username
                    res.cookie("username", sessionData.username, {maxAge: 900000, httpOnly: true})
                    getToken(req.body.username).then((response) => {
                        res.cookie("token", response.data.generatedToken, {maxAge: 900000, httpOnly: true})
                        return res.redirect(302, "/home")
                    })
            });
        }
    })
})

function validate(token) {
    var bodyFormData = new URLSearchParams;
    bodyFormData.append("token", token)
    return axios.post('http://localhost:8081/user/validateToken', bodyFormData, {
        Headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        }
    }).catch((error) => {
       console.log(error.response.data)
    })
}

function getToken(user) {
    var bodyFormData = new URLSearchParams;
    bodyFormData.append("username", user)
    return axios.post('http://localhost:8081/user/generateToken', bodyFormData, {
        Headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        }
    }).catch((error) => {
        console.log(error.response.data)
    })
}

app.get('/home', function(req, res) {
    sessionData = req.session

    if (!req.cookies.token) {
        return res.redirect(302, "/")
    }

    validate(req.cookies.token).then((response) => {
        if (response.data === "Valid token") {
            return res.render('home.ejs', {username: req.cookies.username});
        } else {
            return res.redirect(302, "/")
        }
    })
})

app.get('/logout', function(req, res) {
    sessionData = req.session
    sessionData.destroy()
    res.clearCookie("username")
    res.clearCookie("token")
    return res.redirect(302, "/")
})

app.post('/login', urlencodedParser, async function (req, res) {
    sessionData = req.session
    var query = `SELECT username,password FROM users WHERE username = '${req.body.username}' AND password = '${req.body.password}'`;
    db.get(query, (err, data) => {
        if (err) {
            console.log(err)
        }
        if (data) {
            console.log("Successful login from " + req.body.username)
            sessionData.username = req.body.username
            res.cookie("username", sessionData.username, {maxAge: 900000, httpOnly: true})
            getToken(req.body.username).then((response) => {
                res.cookie("token", response.data.generatedToken, {maxAge: 900000, httpOnly: true})
                sessionData.login_status = "Success"
                return res.redirect(302, "/")
            })
        } else {
            console.log("Login failed from " + req.body.username)
            sessionData.login_status = "Login failed"
            res.redirect(302, "/")
        }
    });
})

app.post("/user/generateToken", urlencodedParser, (req, res) => {
    sessionData = req.session
    var jwtsecretkey = "hehehehehehe"
    var data = {
        userId: req.body.username,
    }
    const token = jwt.sign(data, jwtsecretkey, { expiresIn: '1h' });
    res.send({ generatedToken: token })
})

app.post("/user/validateToken",urlencodedParser, (req, res) => {
    sessionData = req.session
    var jwtsecretkey = "hehehehehehe"

    try {
        const token = req.body.token;
        const decoded = jwt.verify(token, jwtsecretkey);
        if (decoded) {
            return res.status(200).send("Valid token")
        }
    } catch (err) {
        return res.status(401).send("Invalid token")
    }
    res.status(200)
})

var server = app.listen(8081, function () {
   var port = server.address().port
   console.log("App listening at http://%s:%s", os.hostname(), port)
})