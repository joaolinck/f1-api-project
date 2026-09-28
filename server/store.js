import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { ApiError } from "./errors.js";
const scrypt = promisify(scryptCallback);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  const [salt, hash] = encoded.split(":");
  const key = await scrypt(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(hash, "hex"));
}
export const publicUser = ({ id, nome, email, papel }) => ({
  id,
  nome,
  email,
  papel,
});
export function createStore(path = "./data/f1.sqlite") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL, senha TEXT NOT NULL, papel TEXT NOT NULL CHECK(papel IN ('usuario','admin')));
    CREATE TABLE IF NOT EXISTS favorites(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), piloto_id TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(user_id,piloto_id));
    CREATE TABLE IF NOT EXISTS idempotency(user_id INTEGER NOT NULL REFERENCES users(id), key TEXT NOT NULL, body TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(user_id,key));`);
  return {
    db,
    userByEmail: (email) =>
      db.prepare("SELECT * FROM users WHERE email=?").get(email),
    userById: (id) => db.prepare("SELECT * FROM users WHERE id=?").get(id),
    createUser(nome, email, senha, papel = "usuario") {
      try {
        const r = db
          .prepare("INSERT INTO users(nome,email,senha,papel) VALUES(?,?,?,?)")
          .run(nome, email, senha, papel);
        return publicUser(this.userById(Number(r.lastInsertRowid)));
      } catch (e) {
        if (e.message.includes("UNIQUE"))
          throw new ApiError(409, "Email ja cadastrado");
        throw e;
      }
    },
    favorites: (uid) =>
      db
        .prepare(
          "SELECT payload FROM favorites WHERE user_id=? ORDER BY id DESC",
        )
        .all(uid)
        .map((x) => JSON.parse(x.payload)),
    replay(uid, key, body) {
      const old = db
        .prepare("SELECT * FROM idempotency WHERE user_id=? AND key=?")
        .get(uid, key);
      if (!old) return null;
      if (old.body !== body) throw new ApiError(409);
      return JSON.parse(old.payload);
    },
    addFavorite(uid, key, body, piloto) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const old = this.replay(uid, key, body);
        if (old) {
          db.exec("COMMIT");
          return { status: 200, data: old };
        }
        if (
          db
            .prepare("SELECT id FROM favorites WHERE user_id=? AND piloto_id=?")
            .get(uid, piloto.id)
        )
          throw new ApiError(409, "Piloto ja esta nos favoritos");
        const result = db
          .prepare(
            "INSERT INTO favorites(user_id,piloto_id,payload) VALUES(?,?,?)",
          )
          .run(uid, piloto.id, "{}");
        const data = {
          id: Number(result.lastInsertRowid),
          piloto,
          criado_em: new Date().toISOString(),
        };
        const json = JSON.stringify(data);
        db.prepare("UPDATE favorites SET payload=? WHERE id=?").run(
          json,
          data.id,
        );
        db.prepare(
          "INSERT INTO idempotency(user_id,key,body,payload) VALUES(?,?,?,?)",
        ).run(uid, key, body, json);
        db.exec("COMMIT");
        return { status: 201, data };
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    removeFavorite(uid, id) {
      if (
        !db
          .prepare("DELETE FROM favorites WHERE id=? AND user_id=?")
          .run(id, uid).changes
      )
        throw new ApiError(404, "Favorito nao encontrado");
    },
  };
}
