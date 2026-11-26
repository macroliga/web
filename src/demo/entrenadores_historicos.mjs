// Entrenadores historicos usados SOLO como alias de cuentas ficticias.
// No representan cuentas personales de las personas citadas.
export const ENTRENADORES_PILOTO = Object.freeze([
  'Luis Aragonés',
  'Vicente del Bosque',
  'Miguel Muñoz',
  'Javier Irureta',
  'Johan Cruyff',
  'Helenio Herrera',
  'Radomir Antić',
  'Alfredo Di Stéfano',
  'Alex Ferguson',
  'Arsène Wenger',
  'Jupp Heynckes',
  'Ottmar Hitzfeld',
  'Arrigo Sacchi',
  'Fabio Capello',
  'Marcello Lippi',
  'Carlos Bilardo'
]);

export function cuentasDemostracion() {
  return ENTRENADORES_PILOTO.map((entrenador, index) => {
    const numero = index + 1;
    return {
      numero,
      entrenador,
      correo: `demo${String(numero).padStart(2, '0')}@macroliga.invalid`,
      equipo: `Equipo de ${entrenador}`
    };
  });
}
