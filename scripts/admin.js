import { createStore, hashPassword } from "../server/store.js";
import { check, contract } from "../server/contract.js";
const {
  ADMIN_NAME: nome = "Administrador",
  ADMIN_EMAIL: email,
  ADMIN_PASSWORD: senha,
} = process.env;
check(contract.components.schemas.UsuarioCriacao, { nome, email, senha });
const store = createStore(process.env.DATABASE_PATH);
try {
  const user = store.createUser(
    nome,
    email.toLowerCase(),
    await hashPassword(senha),
    "admin",
  );
  console.log(`Administrador criado: ${user.email}`);
} finally {
  store.db.close();
}
