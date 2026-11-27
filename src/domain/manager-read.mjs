// Development adapter. Pass a user-scoped Supabase client, never service_role.
export function managerRead(client) {
  async function read(name, args) {
    const {data: identity, error: authError} = await client.auth.getUser();
    if (authError || !identity?.user?.id) throw new Error('Sesión no válida');
    const {data, error} = await client.rpc(name, args);
    if (error) throw error;
    const {data: current, error: currentError} = await client.auth.getUser();
    if (currentError || current?.user?.id !== identity.user.id) throw new Error('Sesión modificada');
    if (!Array.isArray(data)) throw new Error('Respuesta inválida');
    return data;
  }
  return {
    async teams() {
      return (await read('macroliga_mis_equipos', {})).map(team => ({
        ...team,
        patrimonio_centimos: (BigInt(team.saldo_centimos) + BigInt(team.valor_plantilla_centimos)).toString()
      }));
    },
    roster(teamId) {
      if (typeof teamId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId)) throw new Error('Equipo inválido');
      return read('macroliga_mi_plantilla', {p_equipo_id: teamId});
    }
  };
}
