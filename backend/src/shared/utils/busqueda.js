/**
 * Patrón "contiene" para ILIKE escapando los comodines del usuario.
 * Sin escape, buscar "50%" o "a_b" se interpretaba como comodín (resultados incorrectos y
 * búsquedas más costosas). PostgreSQL usa "\" como carácter de escape por defecto en LIKE.
 */
function patronContiene(termino) {
  const escapado = String(termino).replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escapado}%`;
}

module.exports = { patronContiene };
