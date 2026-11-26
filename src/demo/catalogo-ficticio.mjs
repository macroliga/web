// Solo datos de ensayo originales y artificiales. No son precios ni plantillas reales.
import { POSICIONES, normalizarCatalogo } from '../domain/catalogo-deportivo.mjs';
export function catalogoFicticio() {
  const counts={GK:72,DEF:152,MID:156,FWD:120};
  const players=POSICIONES.flatMap((position,p)=>Array.from({length:counts[position]},(_,i)=>({
    externalId:position+'-'+String(i+1).padStart(3,'0'),
    name:'Futbolista ficticio '+position+' '+(i+1),
    club:'Club ficticio '+(1+i%20),
    position,active:true,
    marketValueCents:String((250000+(i*15485863+p*32452843)%11000000)*100)
  })));
  return normalizarCatalogo({schemaVersion:1,kind:'fixture',provider:'macroliga-fixture',
    competition:'LALIGA',season:'2026_27',currency:'EUR',asOf:'2026-11-26T00:00:00.000Z',
    permissionRef:'Datos inventados exclusivamente para pruebas',players});
}
export function divisionFicticia() {
  return {divisionId:'PILOTO-FICTICIO',season:'2026_27',status:'draft',maxRoster:16,
    initialWealthCents:'7000000000',teamIds:Array.from({length:16},(_,i)=>'equipo-ficticio-'+String(i+1).padStart(2,'0'))};
}
