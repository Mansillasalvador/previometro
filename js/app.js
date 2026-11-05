import { calcular, INTENSIDADES } from "./calc.js";

const $ = (id) => document.getElementById(id);
const pesos = (n) => "$" + Math.round(n).toLocaleString("es-AR");
const decimal = (n) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
const litros = (ml) => (ml >= 1000 ? `${decimal(ml / 1000)} L` : `${Math.round(ml)} ml`);
const gramos = (g) => (g >= 1000 ? `${decimal(g / 1000)} kg` : `${g} g`);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const estado = { trago: 0, intensidad: 1, personas: 4, tragosPorPersona: 3, presupuesto: 0 };
let datos;
let textoActual = "";

async function leer(archivo) {
  const r = await fetch(`data/${archivo}.json`);
  if (!r.ok) throw new Error(archivo);
  return r.json();
}

function opciones(contenedor, nombre, clase, textos, elegido, alCambiar) {
  contenedor.innerHTML = textos.map((texto, i) => `
    <label class="${clase}">
      <input type="radio" name="${nombre}" value="${i}" ${i === elegido ? "checked" : ""}>
      <span>${texto}</span>
    </label>`).join("");
  contenedor.addEventListener("change", (e) => alCambiar(Number(e.target.value)));
}

function dibujarExtras(trago) {
  if (!trago.extras.length) return "";
  return `<p class="extras">Sumale: ${trago.extras.map((e) => e.texto.toLowerCase()).join(", ")}.</p>`;
}

function dibujarPresupuesto(r) {
  if (r.tragosQueAlcanzan === null) return "";
  const monto = pesos(estado.presupuesto);
  const alcanza = `Con ${monto} te alcanza para ${plural(r.tragosQueAlcanzan, "trago", "tragos")} por persona.`;
  return r.excedido
    ? `<p class="alerta" role="status">Se te pasa del presupuesto. ${alcanza}</p>`
    : `<p class="alerta ok" role="status">${alcanza}</p>`;
}

function dibujarRestos(r) {
  const vasos = r.vasosExtra > 0
    ? `Con lo que sobra de los envases salen ${plural(r.vasosExtra, "vaso", "vasos")} más.`
    : "Lo que sobra de los envases no alcanza para otro vaso.";
  let plata = "";
  if (r.plataRestante > 0) plata = `<p class="alerta ok numero">Entre todos les sobran ${pesos(r.plataRestante)}. Alcanza para algo de picar.</p>`;
  else if (r.plataRestante < 0) plata = `<p class="alerta numero">Con los envases enteros les faltan ${pesos(-r.plataRestante)} entre todos.</p>`;
  else if (r.plataRestante === 0) plata = `<p class="alerta ok numero">Justo: el presupuesto cubre la compra y no sobra nada.</p>`;
  return `<p class="nota">${vasos}</p>${plata}`;
}

function dibujarDesglose(r) {
  const seToma = `Cada trago sale ${pesos(r.costoTrago)}.`;
  const queda = Math.round(r.costoCompra) - Math.round(r.costoTotal);
  if (queda <= 0) return seToma;
  return `De eso, ${pesos(r.costoTotal)} se toman y ${pesos(queda)} te quedan en botellas y accesorios para otra vez. ${seToma}`;
}

function textoCompras(trago, r) {
  const { extras } = datos.extras;
  const bebidas = r.ingredientes.map((i) => `${i.envases} x ${datos.catalogo[i.id].nombre}: ${pesos(i.costoEnvases)}`);
  const accesorios = r.extras.map((e) => {
    const x = extras[e.id];
    if (e.sinPrecio) return `${x.nombre}: sin costo`;
    const cantidad = e.envases ? `${e.envases} x ${x.nombre} (${x.unidad})` : `${x.nombre}: ${gramos(e.gramosTotales)}`;
    return `${cantidad}${e.envases ? ":" : ","} ${pesos(e.costo)} (estimado)`;
  });
  return [
    `Previa: ${trago.nombre.toLowerCase()}, ${INTENSIDADES[estado.intensidad].toLowerCase()}`,
    `${plural(estado.personas, "persona", "personas")}, ${plural(estado.tragosPorPersona, "trago", "tragos")} cada una`,
    "",
    "Hay que comprar:",
    ...bebidas,
    ...accesorios,
    "",
    `Total: ${pesos(r.costoCompra)} (${pesos(r.costoCompra / estado.personas)} por persona)`,
    "Valores aproximados. Armado con Previómetro",
  ].join("\n");
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sin permiso o sin https: se usa el método viejo.
    const area = document.createElement("textarea");
    area.value = texto;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function dibujarAccesorios(r) {
  const { extras } = datos.extras;
  return r.extras.map((e) => {
    const x = extras[e.id];
    if (e.sinPrecio) return `<li><span>${x.nombre}</span><span class="precio">Sin costo</span></li>`;
    const cantidad = e.envases ? `${e.envases} x ${x.nombre} (${x.unidad})` : `${x.nombre}: ${gramos(e.gramosTotales)}`;
    return `<li><span>${cantidad}</span><span class="precio">${pesos(e.costo)}</span><small>Precio estimado</small></li>`;
  }).join("");
}

function dibujar(animar = true) {
  const trago = datos.tragos[estado.trago];
  const r = calcular({ ...estado, trago, catalogo: datos.catalogo, accesorios: datos.extras });
  const nombre = (id) => datos.catalogo[id].ingrediente;
  const desactualizado = r.ingredientes.some((i) => datos.catalogo[i.id].desactualizado);

  textoActual = textoCompras(trago, r);
  const resultado = $("resultado");
  resultado.innerHTML = `
    <div>
      <h2>${trago.nombre}, ${INTENSIDADES[estado.intensidad].toLowerCase()}</h2>
      <div class="barra" aria-hidden="true">
        ${r.ingredientes.map((i, n) => `<i class="tono-${n}" style="--p:${i.porcentaje}"></i>`).join("")}
      </div>
      <ul class="porcentajes numero">
        ${r.ingredientes.map((i, n) => `<li><span class="muestra tono-${n}"></span><b>${i.porcentaje}%</b> ${nombre(i.id).toLowerCase()}</li>`).join("")}
      </ul>
      ${dibujarExtras(trago)}
      <p class="alcohol">Alcohol final aproximado: <strong class="numero">${decimal(r.alcohol)}%</strong></p>
    </div>

    <div class="gasto">
      <h3>Vas a gastar</h3>
      <p class="gasto-total numero">${pesos(r.costoCompra)}</p>
      <p class="gasto-persona numero">${pesos(r.costoCompra / estado.personas)} por persona</p>
      <p class="nota numero">${dibujarDesglose(r)}</p>
    </div>

    ${dibujarPresupuesto(r)}

    <div class="revelar">
      <h3>Lo que tenés que comprar</h3>
      <ul class="compras numero">
        ${r.ingredientes.map((i) => {
          const p = datos.catalogo[i.id];
          const sobra = i.sobranteMl > 0 ? `Sobran ${litros(i.sobranteMl)}` : "No sobra nada";
          return `<li>
            <span>${i.envases} x ${p.nombre}</span>
            <span class="precio">${pesos(i.costoEnvases)}</span>
            <small>${sobra}</small>
          </li>`;
        }).join("")}
        ${dibujarAccesorios(r)}
      </ul>
      <p class="total-compra numero"><span>Total a pagar</span><span>${pesos(r.costoCompra)}</span></p>
      ${dibujarRestos(r)}
      <p class="nota">Limón, hielo y demás accesorios son precios y cantidades estimados.</p>
      <div class="compartir">
        <a class="accion llena" href="https://wa.me/?text=${encodeURIComponent(textoActual)}" target="_blank" rel="noopener">Mandar por WhatsApp</a>
        <button type="button" class="accion" id="copiar">Copiar lista</button>
      </div>
      ${desactualizado ? `<p class="nota">Hay precios desactualizados: se muestra el último conocido.</p>` : ""}
    </div>`;

  resultado.classList.remove("recalculo");
  if (animar) {
    void resultado.offsetWidth; // reinicia la animación aunque el cambio sea seguido
    resultado.classList.add("recalculo");
  }
  observarRevelados();
}

let observador;
const yaVisto = new Set();
function observarRevelados() {
  const bloques = document.querySelectorAll(".revelar");
  bloques.forEach((b, i) => {
    if (yaVisto.has(i) || !("IntersectionObserver" in window)) {
      b.style.transition = "none";
      b.classList.add("visto");
      return;
    }
    b.dataset.indice = i;
    observador ??= new IntersectionObserver((entradas) => {
      entradas.filter((e) => e.isIntersecting).forEach((e) => {
        yaVisto.add(Number(e.target.dataset.indice));
        e.target.classList.add("visto");
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    observador.observe(b);
  });
}

function conectarControles() {
  opciones($("tragos"), "trago", "trago", datos.tragos.map((t) => t.nombre), estado.trago, (v) => { estado.trago = v; dibujar(); });
  opciones($("intensidad"), "intensidad", "segmento", INTENSIDADES, estado.intensidad, (v) => { estado.intensidad = v; dibujar(); });

  document.querySelectorAll(".stepper").forEach((stepper) => {
    const campo = stepper.dataset.campo;
    const menos = stepper.querySelector('[data-paso="-1"]');
    menos.disabled = estado[campo] <= 1;
    stepper.addEventListener("click", (e) => {
      const paso = Number(e.target.dataset?.paso);
      if (!paso) return;
      estado[campo] = Math.min(99, Math.max(1, estado[campo] + paso));
      $(campo).textContent = estado[campo];
      menos.disabled = estado[campo] <= 1;
      dibujar();
    });
  });

  $("resultado").addEventListener("click", async (e) => {
    const boton = e.target.closest("#copiar");
    if (!boton) return;
    const ok = await copiar(textoActual);
    boton.textContent = ok ? "Copiada" : "No se pudo copiar";
    boton.classList.toggle("hecho", ok);
    setTimeout(() => {
      if (!boton.isConnected) return;
      boton.textContent = "Copiar lista";
      boton.classList.remove("hecho");
    }, 1800);
  });

  const campo = $("presupuesto");
  campo.addEventListener("input", () => {
    const limpio = campo.value.replace(/\D/g, "").slice(0, 9);
    estado.presupuesto = Number(limpio);
    campo.value = limpio ? estado.presupuesto.toLocaleString("es-AR") : "";
    dibujar(false);
  });

  $("armado").addEventListener("submit", (e) => {
    e.preventDefault();
    const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resultado = $("resultado");
    resultado.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
    resultado.focus({ preventScroll: true });
  });
}

async function iniciar() {
  try {
    const [tragos, ingredientes, precios, extras] = await Promise.all(
      ["tragos", "ingredientes", "precios", "extras"].map(leer),
    );
    const catalogo = {};
    for (const i of ingredientes) {
      if (precios.precios[i.id]) catalogo[i.id] = { ...i, ...precios.precios[i.id] };
    }
    const disponibles = tragos.filter((t) =>
      [t.variable, t.resto, ...t.fijos.map((f) => f.ingrediente)].every((id) => catalogo[id]),
    );
    datos = { tragos: disponibles, catalogo, extras };

    const [a, m, d] = precios.fecha_actualizacion.split("-");
    $("fecha").textContent = `Precios de supermercados de Capital Federal, actualizados el ${d}/${m}/${a}.`;
    conectarControles();
    dibujar(false);
  } catch {
    $("resultado").innerHTML = `<p class="alerta">No pudimos cargar los precios. Recargá la página para probar de nuevo.</p>`;
  }
}

iniciar();
