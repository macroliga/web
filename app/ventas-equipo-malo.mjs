// La cotización y la transferencia pertenecen al servidor. El navegador
// solo presenta el precio y solicita una confirmación explícita.
export function conectarVentaEquipoMalo(boton,jugador,{contexto,euros,confirmar,mensaje,actualizar,generarClave=()=>globalThis.crypto.randomUUID()}){
  if(!jugador.jugador_id){boton.disabled=true;return;}
  let busy=false;
  boton.title='Consultar valor de venta al Equipo Malo';
  boton.addEventListener('click',async()=>{
    const origen={...contexto()};
    if(busy||!origen?.token||!origen?.division||!origen?.identity)return;
    const vigente=()=>{const c=contexto();return Boolean(c?.token&&c.division===origen.division&&c.identity===origen.identity&&c.session===origen.session);};
    const presentable=()=>vigente()&&boton.isConnected;
    const args={p_division_id:origen.division,p_jugador_id:jugador.jugador_id};
    busy=true;boton.disabled=true;
    mensaje('Consultando la venta de '+(jugador.nombre_jugador||'jugador')+'…');
    let intentoVenta=false;
    try{
      const q=await origen.client.consultar('macroliga_cotizar_venta_equipo_malo',args,origen.token);
      if(!presentable())return;
      if(q?.disponible!==true||typeof q.importe_centimos!=='string'||!(/^[1-9]\d{0,18}$/).test(q.importe_centimos)){
        mensaje(q?.motivo||'Venta no disponible.');return;
      }
      if(!confirmar('¿Vender a '+(jugador.nombre_jugador||'este jugador')+' al Equipo Malo por '+euros(q.importe_centimos)+'?\n\nSe retirará de tu plantilla y se abonará el importe a tu saldo. Si está anunciado, se cancelará su anuncio y sus ofertas pendientes.')){
        mensaje('Venta cancelada.');return;
      }
      if(!presentable())return;
      intentoVenta=true;
      const id=await origen.client.operar('macroliga_vender_equipo_malo',{...args,p_importe_centimos:q.importe_centimos,p_clave:generarClave()},contexto().token);
      if(!vigente())return;
      if(typeof id!=='string'||!(/^[a-f0-9-]{36}$/i).test(id))throw Error('Venta no confirmada');
      await actualizar();
      if(vigente())mensaje('Venta confirmada: '+(jugador.nombre_jugador||'jugador')+' · '+euros(q.importe_centimos)+'.');
    }catch(e){
      if(vigente()&&intentoVenta)await actualizar();
      if(vigente())mensaje(e?.operationMessage||'No se pudo confirmar la venta. Consulta tu plantilla antes de reintentar.');
    }finally{
      busy=false;
      if(presentable())boton.disabled=false;
    }
  });
}
