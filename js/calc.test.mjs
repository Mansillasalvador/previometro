// Correr con: node --test js/calc.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { calcular, receta } from "./calc.js";

const leer = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), "utf8"));
const tragos = leer("../data/tragos.json");
const { precios } = leer("../data/precios.json");
const catalogo = {};
for (const i of leer("../data/ingredientes.json")) catalogo[i.id] = { abv: i.abv, ...precios[i.id] };
const buscar = (id) => tragos.find((t) => t.id === id);
const base = { personas: 1, tragosPorPersona: 1, catalogo };

test("aceptación: tinto de verano, Medio, 10 personas, 2 tragos", () => {
  const r = calcular({ ...base, trago: buscar("tinto_verano"), intensidad: 1, personas: 10, tragosPorPersona: 2 });
  const vino = r.ingredientes.find((i) => i.id === "vino_tinto");
  assert.equal(r.tragosTotales, 20);
  assert.equal(vino.mlTotales, 2000);
  assert.equal(vino.envases, 3);
  assert.equal(vino.sobranteMl, 250);
  assert.ok(Math.abs(r.alcohol - 6.5) < 1e-9);
});

test("los 12 tragos suman 100% y todos sus ingredientes tienen precio", () => {
  assert.equal(tragos.length, 12);
  for (const t of tragos) for (const n of [0, 1, 2]) {
    const partes = receta(t, n);
    assert.equal(partes.reduce((s, p) => s + p.porcentaje, 0), 100, t.id);
    assert.ok(partes.every((p) => p.porcentaje >= 0 && catalogo[p.id]?.precio > 0), t.id);
  }
});

test("el resto del spritz se calcula: Fuerte deja 10% de soda", () => {
  assert.deepEqual(receta(buscar("aperol_spritz"), 2).at(-1), { id: "soda", porcentaje: 10 });
});

test("presupuesto: cuenta tragos con floor y avisa si se pasa", () => {
  const trago = { variable: "a", porcentajes: [50, 50, 50], fijos: [], resto: "b" };
  const c = { a: { abv: 40, precio: 1000, ml_envase: 1000 }, b: { abv: 0, precio: 0, ml_envase: 1000 } };
  // 100 ml a $1 el ml: cada trago cuesta $100.
  const entra = calcular({ trago, intensidad: 0, personas: 2, tragosPorPersona: 3, presupuesto: 350, catalogo: c });
  assert.equal(entra.tragosQueAlcanzan, 3);
  assert.equal(entra.excedido, false);
  const pasa = calcular({ trago, intensidad: 0, personas: 2, tragosPorPersona: 3, presupuesto: 250, catalogo: c });
  assert.equal(pasa.tragosQueAlcanzan, 2);
  assert.equal(pasa.excedido, true);
  assert.equal(pasa.costoCompra, 1000);
});

test("sin presupuesto no hay aviso", () => {
  const r = calcular({ ...base, trago: buscar("mojito"), intensidad: 1, presupuesto: 0 });
  assert.equal(r.tragosQueAlcanzan, null);
  assert.equal(r.excedido, false);
});

test("envase justo: no compra uno de más", () => {
  const trago = { variable: "a", porcentajes: [50, 50, 50], fijos: [], resto: "b" };
  const c = { a: { abv: 0, precio: 1, ml_envase: 100 }, b: { abv: 0, precio: 1, ml_envase: 100 } };
  const r = calcular({ trago, intensidad: 0, personas: 1, tragosPorPersona: 1, catalogo: c });
  assert.equal(r.ingredientes[0].envases, 1);
  assert.equal(r.ingredientes[0].sobranteMl, 0);
});

test("plata restante: 2 personas con $10.000 y compra de $15.000 sobran $5.000", () => {
  const trago = { variable: "a", porcentajes: [50, 50, 50], fijos: [], resto: "b" };
  const c = { a: { abv: 0, precio: 15000, ml_envase: 1000 }, b: { abv: 0, precio: 0, ml_envase: 1000 } };
  const r = calcular({ trago, intensidad: 0, personas: 2, tragosPorPersona: 1, presupuesto: 10000, catalogo: c });
  assert.equal(r.plataRestante, 5000);
  const falta = calcular({ trago, intensidad: 0, personas: 2, tragosPorPersona: 1, presupuesto: 5000, catalogo: c });
  assert.equal(falta.plataRestante, -5000);
  const sin = calcular({ trago, intensidad: 0, personas: 2, tragosPorPersona: 1, presupuesto: 0, catalogo: c });
  assert.equal(sin.plataRestante, null);
});

test("vasos extra: manda el ingrediente que menos sobra", () => {
  const trago = { variable: "a", porcentajes: [50, 50, 50], fijos: [], resto: "b" };
  const c = { a: { abv: 0, precio: 1, ml_envase: 1000 }, b: { abv: 0, precio: 1, ml_envase: 450 } };
  // Por trago: 100 ml de cada uno. Sobran 900 ml de a y 350 ml de b.
  const r = calcular({ trago, intensidad: 0, personas: 1, tragosPorPersona: 1, catalogo: c });
  assert.equal(r.vasosExtra, 3);
});

test("accesorios: suman al costo y a la compra, con hielo en bolsas enteras", () => {
  const accesorios = leer("../data/extras.json");
  const trago = buscar("tinto_verano");
  const sin = calcular({ ...base, trago, intensidad: 1, personas: 10, tragosPorPersona: 2 });
  const con = calcular({ ...base, trago, intensidad: 1, personas: 10, tragosPorPersona: 2, accesorios });
  assert.equal(con.costoCompra - sin.costoCompra, 3990);
  assert.ok(Math.abs(con.costoTrago - sin.costoTrago - 199.5) < 1e-9);
});

test("accesorios: la menta va sin costo y el limón se prorratea", () => {
  const accesorios = leer("../data/extras.json");
  const r = calcular({ ...base, trago: buscar("mojito"), intensidad: 1, accesorios });
  assert.equal(r.extras.find((e) => e.id === "menta").sinPrecio, true);
  assert.ok(Math.abs(r.extras.find((e) => e.id === "limon").costo - 104) < 1e-9);
});
