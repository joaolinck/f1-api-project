import { readFileSync } from "node:fs";
import YAML from "yaml";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { ApiError } from "./errors.js";
export const contract = YAML.parse(
  readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8"),
);
export const deref = (value) =>
  value?.$ref
    ? value.$ref
        .slice(2)
        .split("/")
        .reduce((x, k) => x[k], contract)
    : value;
function convert(value) {
  if (Array.isArray(value)) return value.map(convert);
  if (!value || typeof value !== "object") return value;
  if (value.$ref) return convert(deref(value));
  const out = Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => !["example", "xml", "nullable"].includes(k))
      .map(([k, v]) => [k, convert(v)]),
  );
  if (value.nullable) return { anyOf: [out, { type: "null" }] };
  return out;
}
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addFormat("password", true);
const validators = new Map();
export function validator(schema) {
  const key = JSON.stringify(schema);
  if (!validators.has(key)) validators.set(key, ajv.compile(convert(schema)));
  return validators.get(key);
}
export function check(schema, data, field = "corpo") {
  const validate = validator(schema);
  if (!validate(data))
    throw new ApiError(
      400,
      undefined,
      validate.errors.map((e) => ({
        campo: `${field}${e.instancePath}`,
        problema: e.message,
      })),
    );
}
export function validateRequest(path, method) {
  const item = contract.paths[path];
  const operation = item[method];
  return (req, res, next) => {
    for (const ref of [
      ...(item.parameters || []),
      ...(operation.parameters || []),
    ]) {
      const p = deref(ref);
      let value =
        p.in === "header"
          ? req.get(p.name)
          : p.in === "path"
            ? req.params[p.name]
            : req.query[p.name];
      if (value === undefined) {
        if (p.required)
          throw new ApiError(400, undefined, [
            { campo: p.name, problema: "campo obrigatorio" },
          ]);
        continue;
      }
      if (
        p.schema.type === "integer" &&
        typeof value === "string" &&
        /^\d+$/.test(value)
      )
        value = Number(value);
      check(p.schema, value, p.name);
    }
    if (operation.requestBody)
      check(
        deref(operation.requestBody).content["application/json"].schema,
        req.body,
      );
    next();
  };
}
export function checkResponse(path, method, status, data, external = false) {
  const schema = deref(contract.paths[path][method].responses[status])
    ?.content?.["application/json"]?.schema;
  if (schema && !validator(schema)(data))
    throw new ApiError(external ? 502 : 500);
  return data;
}
