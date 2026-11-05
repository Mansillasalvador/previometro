// Fórmulas del BRIEF, sección 4. Sin acceso a la página: se testea con node.
export const VASO_BASE_ML = 300;
// Un tercio del vaso lo ocupa el hielo: en el de 300 ml entran 200 ml de líquido.
export const liquidoDelVaso = (vasoMl) => Math.round((vasoMl * 2) / 3);
export const INTENSIDADES = ["Suave", "Medio", "Fuerte"];

// Devuelve [{ id, porcentaje }] sumando 100, con el resto al final.
export function receta(trago, intensidad) {
  const partes = [
    { id: trago.variable, porcentaje: trago.porcentajes[intensidad] },
    ...trago.fijos.map((f) => ({ id: f.ingrediente, porcentaje: f.porcentaje })),
  ];
  const usado = partes.reduce((suma, p) => suma + p.porcentaje, 0);
  return [...partes, { id: trago.resto, porcentaje: 100 - usado }];
}

// catalogo: { [id]: { abv, precio, ml_envase } }
// accesorios: contenido de extras.json. Sus costos son estimados y se suman a todo.
export function calcular({ trago, intensidad, personas, tragosPorPersona, presupuesto, catalogo, accesorios, quitados = [], vasoMl = VASO_BASE_ML }) {
  const liquido = liquidoDelVaso(vasoMl);
  const tragosTotales = personas * tragosPorPersona;
  let alcohol = 0;
  let costoTrago = 0;
  let costoCompra = 0;

  const ingredientes = receta(trago, intensidad).map(({ id, porcentaje }) => {
    const { abv, precio, ml_envase: mlEnvase } = catalogo[id];
    const mlPorTrago = (porcentaje * liquido) / 100;
    // Se multiplica antes de dividir para que un decimal no sume un envase de más.
    const mlTotales = (porcentaje * liquido * tragosTotales) / 100;
    const envases = Math.ceil(mlTotales / mlEnvase);
    const costoEnvases = envases * precio;

    alcohol += (porcentaje * abv) / 100;
    costoTrago += (mlPorTrago * precio) / mlEnvase;
    costoCompra += costoEnvases;

    return { id, porcentaje, mlPorTrago, mlTotales, envases, costoEnvases, sobranteMl: envases * mlEnvase - mlTotales };
  });

  const pedidos = accesorios
    ? [...trago.extras, { extra: "hielo", gramos: Math.round((accesorios.hielo_g_por_trago * vasoMl) / VASO_BASE_ML) }].filter((e) => e.extra && !quitados.includes(e.extra))
    : [];
  const extras = pedidos.map(({ extra: id, gramos }) => {
    const x = accesorios.extras[id];
    if (x.precio === null || !gramos) return { id, sinPrecio: true };
    const gramosTotales = gramos * tragosTotales;
    const envases = x.entero ? Math.ceil(gramosTotales / x.envase_g) : null;
    const costo = x.entero ? envases * x.precio : (gramosTotales * x.precio) / x.envase_g;
    costoTrago += (gramos * x.precio) / x.envase_g;
    costoCompra += costo;
    return { id, gramosTotales, envases, costo };
  });

  const tragosQueAlcanzan = presupuesto > 0 ? Math.floor(presupuesto / costoTrago) : null;
  // Positivo: sobra plata del pozo. Negativo: falta para pagar los envases enteros.
  const plataRestante = presupuesto > 0 ? presupuesto * personas - costoCompra : null;
  // Un vaso más necesita de todos los ingredientes, así que manda el que menos sobra.
  const vasosExtra = Math.min(
    ...ingredientes.filter((i) => i.porcentaje > 0).map((i) => Math.floor(i.sobranteMl / i.mlPorTrago)),
  );

  return {
    ingredientes,
    extras,
    alcohol,
    tragosTotales,
    costoTrago,
    costoPersona: costoTrago * tragosPorPersona,
    costoTotal: costoTrago * tragosTotales,
    costoCompra,
    tragosQueAlcanzan,
    plataRestante,
    vasosExtra,
    excedido: tragosQueAlcanzan !== null && tragosQueAlcanzan < tragosPorPersona,
  };
}
