// Reglas de referencia derivadas EXCLUSIVAMENTE de los CSV de MACROLIGA.
// Tramo = último inicio <= valor; contrastado en solo lectura con la fórmula original.
// No habilita pagos; el servidor debe cotizar y verificar la ventana.
const tramos=[
  [16000000n,'3.9'],[35000000n,'3.7'],[45000000n,'3.6'],[50000000n,'3.55'],[55000000n,'3.5'],
  [60000000n,'3.45'],[65000000n,'3.4'],[70000000n,'3.35'],[75000000n,'3.3'],[80000000n,'3.25'],
  [85000000n,'3.2'],[90000000n,'3.15'],[95000000n,'3.1'],[100000000n,'3'],[105000000n,'2.9'],
  [110000000n,'2.85'],[115000000n,'2.8'],[120000000n,'2.7'],[125000000n,'2.65'],[130000000n,'2.6'],
  [135000000n,'2.55'],[140000000n,'2.5'],[145000000n,'2.45'],[150000000n,'2.4'],[155000000n,'2.35'],
  [160000000n,'2.3'],[165000000n,'2.25'],[170000000n,'2.2'],[175000000n,'2.15'],[180000000n,'2.1'],
  [185000000n,'2.1'],[190000000n,'2.05'],[195000000n,'2'],[200000000n,'2'],[210000000n,'2'],
  [220000000n,'2'],[230000000n,'2'],[240000000n,'1.95'],[250000000n,'1.9'],[260000000n,'1.85'],
  [270000000n,'1.85'],[280000000n,'1.8'],[290000000n,'1.75'],[300000000n,'1.7'],[310000000n,'1.69'],
  [320000000n,'1.68'],[330000000n,'1.67'],[340000000n,'1.66'],[350000000n,'1.65'],[360000000n,'1.64'],
  [370000000n,'1.63'],[380000000n,'1.62'],[390000000n,'1.61'],[400000000n,'1.6'],[410000000n,'1.59'],
  [420000000n,'1.58'],[430000000n,'1.57'],[440000000n,'1.56'],[450000000n,'1.55'],[460000000n,'1.54'],
  [470000000n,'1.53'],[480000000n,'1.52'],[490000000n,'1.51'],[500000000n,'1.5'],[510000000n,'1.49'],
  [520000000n,'1.48'],[530000000n,'1.47'],[540000000n,'1.465'],[550000000n,'1.46'],[560000000n,'1.455'],
  [570000000n,'1.45'],[580000000n,'1.45'],[590000000n,'1.4'],[600000000n,'1.435'],[610000000n,'1.43'],
  [620000000n,'1.425'],[630000000n,'1.42'],[640000000n,'1.415'],[650000000n,'1.41'],[660000000n,'1.405'],
  [670000000n,'1.4'],[680000000n,'1.395'],[690000000n,'1.39'],[700000000n,'1.386'],[710000000n,'1.385'],
  [720000000n,'1.38'],[730000000n,'1.375'],[740000000n,'1.37'],[750000000n,'1.365'],[760000000n,'1.365'],
  [770000000n,'1.36'],[780000000n,'1.355'],[790000000n,'1.355'],[800000000n,'1.353'],[810000000n,'1.351'],
  [820000000n,'1.349'],[830000000n,'1.347'],[840000000n,'1.34'],[850000000n,'1.33'],[860000000n,'1.329'],
  [870000000n,'1.328'],[880000000n,'1.324'],[890000000n,'1.32'],[900000000n,'1.322225'],[910000000n,'1.32'],
  [920000000n,'1.318'],[930000000n,'1.316'],[940000000n,'1.314'],[950000000n,'1.312'],[960000000n,'1.31'],
  [970000000n,'1.309'],[980000000n,'1.307'],[990000000n,'1.305'],[1000000000n,'1.3'],[1010000000n,'1.298'],
  [1020000000n,'1.296'],[1030000000n,'1.294'],[1040000000n,'1.292'],[1050000000n,'1.29'],[1060000000n,'1.288'],
  [1070000000n,'1.286'],[1080000000n,'1.284'],[1090000000n,'1.282'],[1100000000n,'1.2819'],[1110000000n,'1.279'],
  [1120000000n,'1.277'],[1130000000n,'1.275'],[1140000000n,'1.274'],[1150000000n,'1.273'],[1160000000n,'1.272'],
  [1170000000n,'1.271'],[1180000000n,'1.27'],[1190000000n,'1.269'],[1200000000n,'1.2667'],[1210000000n,'1.265'],
  [1220000000n,'1.264'],[1230000000n,'1.263'],[1240000000n,'1.262'],[1250000000n,'1.259'],[1260000000n,'1.258'],
  [1270000000n,'1.257'],[1280000000n,'1.256'],[1290000000n,'1.255'],[1300000000n,'1.2539'],[1310000000n,'1.252'],
  [1320000000n,'1.251'],[1330000000n,'1.25'],[1340000000n,'1.25'],[1350000000n,'1.249'],[1360000000n,'1.248'],
  [1370000000n,'1.247'],[1380000000n,'1.246'],[1390000000n,'1.245'],[1400000000n,'1.243'],[1410000000n,'1.242'],
  [1420000000n,'1.241'],[1430000000n,'1.24'],[1440000000n,'1.239'],[1450000000n,'1.238'],[1460000000n,'1.237'],
  [1470000000n,'1.236'],[1480000000n,'1.235'],[1490000000n,'1.234'],[1500000000n,'1.23334'],[1510000000n,'1.233'],
  [1520000000n,'1.232'],[1530000000n,'1.231'],[1540000000n,'1.23'],[1550000000n,'1.229'],[1560000000n,'1.228'],
  [1570000000n,'1.227'],[1580000000n,'1.227'],[1590000000n,'1.226'],[1600000000n,'1.225'],[1620000000n,'1.224'],
  [1630000000n,'1.224'],[1640000000n,'1.223'],[1650000000n,'1.222'],[1660000000n,'1.221'],[1670000000n,'1.22'],
  [1680000000n,'1.219'],[1690000000n,'1.218'],[1700000000n,'1.21765'],[1710000000n,'1.217'],[1720000000n,'1.216'],
  [1730000000n,'1.215'],[1740000000n,'1.215'],[1750000000n,'1.214'],[1760000000n,'1.214'],[1770000000n,'1.214'],
  [1780000000n,'1.213'],[1790000000n,'1.212'],[1800000000n,'1.211115'],[1810000000n,'1.21'],[1820000000n,'1.21'],
  [1830000000n,'1.209'],[1840000000n,'1.209'],[1850000000n,'1.208'],[1860000000n,'1.205'],[1870000000n,'1.204'],
  [1880000000n,'1.203'],[1890000000n,'1.202'],[1900000000n,'1.20651'],[1910000000n,'1.205'],[1920000000n,'1.204'],
  [1930000000n,'1.204'],[1940000000n,'1.203'],[1950000000n,'1.203'],[1960000000n,'1.202'],[1970000000n,'1.201'],
  [1980000000n,'1.201'],[1990000000n,'1.201'],[2000000000n,'1.2'],[2010000000n,'1.199'],[2020000000n,'1.199'],
  [2030000000n,'1.198'],[2040000000n,'1.198'],[2050000000n,'1.197'],[2060000000n,'1.196'],[2070000000n,'1.196'],
  [2080000000n,'1.195'],[2090000000n,'1.195'],[2100000000n,'1.195239'],[2110000000n,'1.194'],[2120000000n,'1.194'],
  [2130000000n,'1.194'],[2140000000n,'1.193'],[2150000000n,'1.193'],[2160000000n,'1.193'],[2170000000n,'1.192'],
  [2180000000n,'1.192'],[2190000000n,'1.192'],[2200000000n,'1.191'],[2210000000n,'1.19'],[2220000000n,'1.19'],
  [2230000000n,'1.19'],[2240000000n,'1.189'],[2250000000n,'1.189'],[2260000000n,'1.189'],[2270000000n,'1.188'],
  [2280000000n,'1.187'],[2290000000n,'1.187'],[2300000000n,'1.187'],[2310000000n,'1.187'],[2330000000n,'1.185'],
  [2340000000n,'1.185'],[2350000000n,'1.185'],[2360000000n,'1.185'],[2370000000n,'1.184'],[2380000000n,'1.184'],
  [2390000000n,'1.184'],[2400000000n,'1.1835'],[2410000000n,'1.1834'],[2420000000n,'1.1833'],[2430000000n,'1.1832'],
  [2440000000n,'1.1831'],[2450000000n,'1.1829'],[2460000000n,'1.1829'],[2470000000n,'1.181'],[2480000000n,'1.181'],
  [2490000000n,'1.18'],[2500000000n,'1.18'],[2510000000n,'1.179'],[2520000000n,'1.179'],[2530000000n,'1.179'],
  [2540000000n,'1.179'],[2550000000n,'1.179'],[2560000000n,'1.178'],[2570000000n,'1.178'],[2580000000n,'1.176'],
  [2590000000n,'1.175'],[2600000000n,'1.177'],[2610000000n,'1.177'],[2620000000n,'1.177'],[2630000000n,'1.175'],
  [2640000000n,'1.1758'],[2650000000n,'1.1758'],[2660000000n,'1.1756'],[2670000000n,'1.1754'],[2680000000n,'1.1752'],
  [2690000000n,'1.1751'],[2700000000n,'1.1741'],[2710000000n,'1.1741'],[2720000000n,'1.1741'],[2730000000n,'1.1741'],
  [2740000000n,'1.174'],[2750000000n,'1.174'],[2760000000n,'1.173'],[2770000000n,'1.172'],[2780000000n,'1.172'],
  [2790000000n,'1.171'],[2800000000n,'1.1715'],[2810000000n,'1.1715'],[2820000000n,'1.1714'],[2830000000n,'1.1714'],
  [2840000000n,'1.1713'],[2850000000n,'1.1713'],[2860000000n,'1.1712'],[2870000000n,'1.171'],[2880000000n,'1.17'],
  [2900000000n,'1.169'],[2910000000n,'1.1685'],[2920000000n,'1.1683'],[2930000000n,'1.1675'],[2940000000n,'1.1672'],
  [2950000000n,'1.167'],[2960000000n,'1.1676'],[2970000000n,'1.1674'],[2980000000n,'1.167'],[2990000000n,'1.1669'],
  [3000000000n,'1.1667'],[3100000000n,'1.165'],[3200000000n,'1.164'],[3300000000n,'1.163'],[3400000000n,'1.161'],
  [3500000000n,'1.159'],[3600000000n,'1.157'],[3700000000n,'1.156'],[3800000000n,'1.155'],[3900000000n,'1.153'],
  [4000000000n,'1.15'],[4100000000n,'1.15'],[4200000000n,'1.145'],[4300000000n,'1.144'],[4400000000n,'1.143'],
  [4500000000n,'1.142'],[4600000000n,'1.14'],[4700000000n,'1.139'],[4800000000n,'1.138'],[4900000000n,'1.137'],
  [5000000000n,'1.137'],[5100000000n,'1.135'],[5200000000n,'1.134'],[5300000000n,'1.133'],[5400000000n,'1.131'],
  [5500000000n,'1.131'],[5600000000n,'1.125'],[5700000000n,'1.125'],[5800000000n,'1.123'],[5900000000n,'1.121'],
  [6000000000n,'1.12'],[6100000000n,'1.119'],[6200000000n,'1.1165'],[6300000000n,'1.115'],[6400000000n,'1.114'],
  [6500000000n,'1.113'],[6600000000n,'1.113'],[6700000000n,'1.11'],[6800000000n,'1.109'],[6900000000n,'1.108'],
  [7000000000n,'1.1072'],[7100000000n,'1.106'],[7200000000n,'1.1057'],[7300000000n,'1.1054'],[7400000000n,'1.105'],
  [7500000000n,'1.104'],[7600000000n,'1.1035'],[7700000000n,'1.103'],[7800000000n,'1.1025'],[7900000000n,'1.101'],
  [8000000000n,'1.1'],[8100000000n,'1.1'],[8200000000n,'1.1'],[8300000000n,'1.1'],[8400000000n,'1.1'],
  [8500000000n,'1.1'],[8600000000n,'1.1'],[8700000000n,'1.1'],[8800000000n,'1.1'],[8900000000n,'1.1'],
  [9000000000n,'1.1'],[9100000000n,'1.1'],[9200000000n,'1.1'],[9300000000n,'1.1'],[9400000000n,'1.1'],
  [9500000000n,'1.1'],[9600000000n,'1.1'],[9700000000n,'1.1'],[9800000000n,'1.1'],[9900000000n,'1.1'],
  [10000000000n,'1.1'],[10100000000n,'1.1'],
];
const ampliacion=new Map([
  [10100000000n,'1.100'],[11000000000n,'1.099'],[12000000000n,'1.098'],[13000000000n,'1.097'],[15000000000n,'1.095'],
  [17500000000n,'1.0925'],[20000000000n,'1.090'],
]);
const maxOriginal=tramos.at(-1)[0];
function multiplicarExacto(centimos,factor){
  const [entero,decimales='']=factor.split('.');
  const num=centimos*BigInt(entero+decimales),den=10n**BigInt(decimales.length);
  return num%den===0n?(num/den).toString():null;
}
export function detalleReferenciaClausula(centimos){
  if(typeof centimos==='number'&&!Number.isSafeInteger(centimos))return null;
  if(!/^[1-9]\d*$/.test(String(centimos)))return null;
  const value=BigInt(centimos);
  if(value<tramos[0][0])return null; // La fuente tampoco define un tramo inferior.
  if(value>maxOriginal){const factor=ampliacion.get(value);return factor?detalle(value,factor):null;}
  let lo=0,hi=tramos.length-1;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(tramos[mid][0]<=value)lo=mid;else hi=mid-1;}
  return detalle(value,tramos[lo][1]);
}
function detalle(value,factor){
  const importe=multiplicarExacto(value,factor);
  return importe===null?null:{importe,factor};
}
export function referenciaClausula(centimos){
  return detalleReferenciaClausula(centimos)?.importe??null;
}
export function cotizacionValida(q){
  return q?.disponible===true && typeof q.importe_centimos==='string' &&
    /^[1-9]\d{0,18}$/.test(q.importe_centimos);
}
export function controlClausula(doc,r,{euros,cotizar,pagar,vigente=()=>true,compacto=false}){
  if(r.propietario_tipo!=='bad_team'||r.activo!==true)return null;
  const node=(tag,txt)=>{const n=doc.createElement(tag);if(txt!=null)n.textContent=txt;return n;};
  const box=node('div');box.className=compacto?'bad-team-clause bad-team-clause-inline':'bad-team-clause';
  const ref=referenciaClausula(r.valor_mercado_centimos);
  if(compacto){
    const price=node('div');price.className='bad-team-price';
    const etiqueta=node('span','Precio Equipo Malo');etiqueta.className='bad-team-price-label';
    const precio=node('strong',ref?euros(ref):'Por consultar');precio.className='bad-team-price-value';
    const hint=node('small','Referencia');hint.className='bad-team-price-hint';
    price.appendChild(etiqueta);price.appendChild(precio);price.appendChild(hint);
    box.appendChild(price);
  }else box.appendChild(node('span',ref?'Cláusula de referencia: '+euros(ref):'Cláusula: importe pendiente de regla'));
  const open=node('button',compacto?'Comprar':'Pagar cláusula');open.type='button';if(compacto){open.className='bad-team-buy';open.setAttribute('aria-label','Comprar a '+r.nombre_jugador);}open.setAttribute('aria-expanded','false');
  const details=node('div');details.hidden=true;details.className='bad-team-clause-detail';
  const status=node('p','');status.setAttribute('role','status');details.appendChild(status);
  const confirm=node('button','Confirmar pago');confirm.type='button';confirm.disabled=true;details.appendChild(confirm);
  let q=null,request=0,working=false,clave=null;
  open.addEventListener('click',async()=>{
    if(working||!vigente())return;
    request++;const seq=request;
    details.hidden=!details.hidden;open.setAttribute('aria-expanded',String(!details.hidden));
    q=null;confirm.disabled=true;clave=null;
    if(details.hidden)return;
    status.textContent='Comprobando precio y disponibilidad…';
    try{
      const result=await cotizar();
      if(seq!==request||!vigente()||details.hidden)return;
      if(!cotizacionValida(result)){
        status.textContent=result?.motivo||'Pago todavía no habilitado. No se ha realizado ningún cargo.';
        return;
      }
      q=result;clave=globalThis.crypto.randomUUID();
      status.textContent='Fichar a '+r.nombre_jugador+' por '+euros(q.importe_centimos)+'. Se descontará de tu saldo y pasará a tu plantilla.';
      confirm.disabled=false;
    }catch{if(seq===request&&vigente()&&!details.hidden)status.textContent='Pago todavía no disponible. No se ha realizado ningún cargo.';}
  });
  confirm.addEventListener('click',async()=>{
    if(working||confirm.disabled||!q||!vigente())return;
    working=true;confirm.disabled=true;open.disabled=true;
    status.textContent='Confirmando fichaje…';
    try{
      await pagar(q.importe_centimos,clave);
      if(vigente())status.textContent='Fichaje confirmado.';
    }catch(e){
      if(vigente())status.textContent=e?.operationMessage||'No se ha podido confirmar el fichaje. Consulta tu plantilla antes de reintentar.';
    }finally{working=false;open.disabled=false;q=null;clave=null;}
  });
  box.appendChild(open);box.appendChild(details);return box;
}

