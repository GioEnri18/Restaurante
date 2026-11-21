const { Sequelize } = require('sequelize');
const { env } = require('../config/env');
const { buildPgSslOptions } = require('../config/pgSsl');

/**
 * Crea o actualiza el usuario de LOGIN de la API y lo hace miembro de pos_app_rol
 * (rol de grupo de mínimo privilegio creado por la migración 20261122000002).
 *
 * Uso:  APP_DB_USER=pos_app APP_DB_PASSWORD=... npm run db:crear-rol-app
 * Se conecta con DATABASE_MIGRATION_URL (dueño). Usuario y contraseña se leen solo de variables
 * de entorno y nunca se escriben en archivos ni en logs. Después, apunta DATABASE_URL a ese usuario.
 */
async function main() {
  const usuario = process.env.APP_DB_USER?.trim();
  const password = process.env.APP_DB_PASSWORD;

  if (!usuario || !/^[a-z_][a-z0-9_]{2,62}$/.test(usuario)) {
    throw new Error('APP_DB_USER es obligatorio (minúsculas, números y _; 3 a 63 caracteres).');
  }
  if (!password || password.length < 16) {
    throw new Error('APP_DB_PASSWORD es obligatoria y debe tener al menos 16 caracteres.');
  }

  const url =
    env.NODE_ENV === 'test'
      ? env.DATABASE_MIGRATION_URL_TEST || env.DATABASE_URL_TEST
      : env.DATABASE_MIGRATION_URL || env.DATABASE_URL;
  const sslOptions = buildPgSslOptions(url);
  const sequelize = new Sequelize(url, {
    dialect: 'postgres',
    logging: false,
    ...(sslOptions ? { dialectOptions: { ssl: sslOptions } } : {}),
  });

  try {
    const [existe] = await sequelize.query('SELECT 1 FROM pg_roles WHERE rolname = :usuario', {
      replacements: { usuario },
      type: Sequelize.QueryTypes.SELECT,
    });
    // El nombre ya está validado con regex; la contraseña va como literal escapado por PostgreSQL
    const [{ literal }] = await sequelize.query('SELECT quote_literal(:password) AS literal', {
      replacements: { password },
      type: Sequelize.QueryTypes.SELECT,
    });
    const verbo = existe ? 'ALTER' : 'CREATE';
    await sequelize.query(
      `${verbo} ROLE "${usuario}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT PASSWORD ${literal}`,
    );
    await sequelize.query(`GRANT pos_app_rol TO "${usuario}"`);
    console.log(`✅ Usuario de BD "${usuario}" ${existe ? 'actualizado' : 'creado'} como miembro de pos_app_rol.`);
  } finally {
    await sequelize.close();
  }
}

main().catch((error) => {
  console.error('❌ No se pudo crear el usuario de la API:', error.message);
  process.exit(1);
});
