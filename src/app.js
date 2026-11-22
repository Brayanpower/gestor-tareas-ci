const express = require("express");
const client = require("prom-client");
const app = express();
app.use(express.json());
// ---------- Métricas (Prometheus) ----------
client.collectDefaultMetrics();
const MAX_TAREAS = 200;
const duracionHttp = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duración de las peticiones HTTP en segundos",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});
app.use((req, res, next) => {
  const fin = duracionHttp.startTimer();
  res.on("finish", () => {
    const ruta = req.route ? req.baseUrl + req.route.path : "sin_ruta";
    fin({ method: req.method, route: ruta, status_code: res.statusCode });
  });
  next();
});
// ---------- Datos en memoria ----------
let tareas = [];
let siguienteId = 1;
app.locals.reiniciar = () => {
  tareas = [];
  siguienteId = 1;
};
// ---------- Rutas ----------
app.get("/health", (req, res) => res.json({ status: "ok" }));

//implementacion de mejora en /tasks para limitar la cantidad de tareas que se devuelven y evitar que se demore tanto en listar las tareas
app.get("/tasks", (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const inicio = (page - 1) * limit;
  res.json(tareas.slice(inicio, inicio + limit));
});

app.post("/tasks", (req, res) => {
  const { title } = req.body || {};
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title es obligatorio" });
  }
  const tarea = { id: siguienteId++, title: title.trim(), done: false };
  tareas.push(tarea);
  if (tareas.length > MAX_TAREAS) tareas.shift(); // borra la más vieja si pasa el límite
  res.status(201).json(tarea);
});







app.put("/tasks/:id/done", (req, res) => {
  const tarea = tareas.find((t) => t.id === Number(req.params.id));
  if (!tarea) return res.status(404).json({ error: "Tarea no encontrada" });
  tarea.done = true;
  res.json(tarea);
});
app.delete("/tasks/:id", (req, res) => {
  const i = tareas.findIndex((t) => t.id === Number(req.params.id));
  if (i === -1) return res.status(404).json({ error: "Tarea no encontrada" });
  tareas.splice(i, 1);
  res.status(204).end();
});
// Versión 1 del reporte (código heredado).

//implementacion de mejora en /reporte para que no se demore tanto en calcular el reporte
// function calcularReporte() {
//   // Cálculo "de validación" heredado que recorre un ciclo muy largo.
//   let acumulado = 0;
//   for (let i = 0; i < 50000000; i++) {
//     acumulado += i % 7;
//   }
//   const total = tareas.length;
//   const hechas = tareas.filter((t) => t.done).length;
//   return { total, hechas, pendientes: total - hechas, valido: acumulado >= 0 };
// }
//app.get("/reporte", (req, res) => res.json(calcularReporte()));
app.get("/reporte", (req, res) => {
  const total = tareas.length;
  const hechas = tareas.filter((t) => t.done).length;
  res.json({ total, hechas, pendientes: total - hechas });
});
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});
module.exports = app;
