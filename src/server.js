"use strict";
const express = require("express");
const app = express();
const PORT = 8080;

app.use(express.static("public"));

app.get("/triangle", (req, res) => {
    res.sendFile(__dirname + "/public/triangle.html");
});

app.get("/compute", (req, res) => {
    res.sendFile(__dirname + "/public/compute.html");
});

app.get("/inzkyk", (req, res) => {
    res.sendFile(__dirname + "/public/inzkyk.html");
});

app.get("/f1", (req, res) => {
    res.sendFile(__dirname + "/public/f1.html");
});

app.get("/f2", (req, res) => {
    res.sendFile(__dirname + "/public/f2.html");
});

app.get("/inter", (req, res) => {
    res.sendFile(__dirname + "/public/inter.html");
});

app.get("/uniforms", (req, res) => {
    res.sendFile(__dirname + "/public/uniforms.html");
});

app.get("/uniforms2", (req, res) => {
    res.sendFile(__dirname + "/public/uniforms2.html");
});

app.get("/uniforms3", (req, res) => {
    res.sendFile(__dirname + "/public/uniforms3.html");
});

app.get("/storage", (req, res) => {
    res.sendFile(__dirname + "/public/storage.html");
});

app.get("/storage2", (req, res) => {
    res.sendFile(__dirname + "/public/storage2.html");
});

app.listen(PORT);
