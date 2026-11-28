const uuid = v => {if(typeof v!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v)) throw new Error('Identificador inválido');return v;};
export function managerMarket(client) {
 async function call(name,args={}) {
  const {data: before,error: authError}=await client.auth.getUser();
  if(authError||!before?.user?.id) throw new Error('Sesión no válida');
  const {data,error}=await client.rpc(name,args);
  if(error) throw error;
  const {data: after,error: afterError}=await client.auth.getUser();
  if(afterError||after?.user?.id!==before.user.id) throw new Error('Sesión modificada; comprueba el estado antes de reintentar');
  return data;
 }
 return {
  market: team=>call('macroliga_mi_mercado',{p_equipo_id:uuid(team)}),
  bids: ()=>call('macroliga_mis_pujas'),
  bid(lot,cents) {
   if(!Number.isSafeInteger(cents)||cents<=0) throw new Error('Importe inválido');
   return call('macroliga_presentar_puja',{p_lote_id:uuid(lot),p_importe_centimos:cents});
  },
  withdraw: bid=>call('macroliga_retirar_puja',{p_puja_id:uuid(bid)})
 };
}
