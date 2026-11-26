// MACROLIGA · Alta temporal DESACTIVADA tras confirmar 16 cuentas (26/11/2026).
// No utilizar como entrada administrativa; el codigo original solo queda
// en el historial de GitHub para auditoria y no debe volver a desplegarse.
Deno.serve((_req: Request) =>
  new Response(JSON.stringify({
    ok: false,
    error: "Alta temporal finalizada. No se pueden crear mas cuentas desde esta funcion."
  }), {
    status: 410,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  })
);
