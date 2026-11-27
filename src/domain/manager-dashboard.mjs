import {managerRead} from './manager-read.mjs';
import {managerMarket} from './manager-market.mjs';
export function managerDashboard(client) {
 const reads=managerRead(client), market=managerMarket(client);
 let generation=0, busy=false;
 async function load(teamId) {
  const ticket=++generation;
  const teams=await reads.teams();
  const selected=teams.find(t=>t.equipo_id===teamId)??teams[0];
  const [roster,lots,bids]=selected?await Promise.all([reads.roster(selected.equipo_id),market.market(selected.equipo_id),market.bids()]):[[],[],[]];
  if(ticket!==generation) throw new Error('Consulta sustituida');
  return {teams,selected,roster,lots,bids};
 }
 async function mutate(action,teamId) {
  if(busy) throw new Error('Operación en curso');
  busy=true;
  try {const result=await action();try{return {result,view:await load(teamId)}}catch{return {result,view:null,refreshRequired:true}}}
  finally {busy=false;}
 }
 return {load, invalidate(){generation++;}, bid:(team,lot,cents)=>mutate(()=>market.bid(lot,cents),team),withdraw:(team,bid)=>mutate(()=>market.withdraw(bid),team)};
}
