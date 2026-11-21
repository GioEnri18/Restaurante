// Gramajes provisionales de una porción. Las carnes y las papas se pesan antes de cocinar.
// Los preparados (batter, guacamole, aderezos, cebolla caramelizada) se pesan listos para usar.
const papas = { 'Papas para freír': 150, 'Aceite de fritura imputado': 10 };
const empanizado = { Batter: 30, Panko: 25 };
const panHamburguesa = {
  'Pan de hamburguesa': 75,
  Aderezo: 20,
  Lechuga: 15,
  Tomate: 30,
  'Cebolla caramelizada': 20,
};
const tacos = { 'Tortilla de maíz': 75, 'Cebolla blanca': 15, Cilantro: 4, Limón: 20, Salsa: 20 };
const birria = {
  'Res para birria': 170, 'Chile guajillo seco': 5, 'Chile ancho seco': 2,
  Tomate: 25, Ajo: 3, 'Cebolla blanca': 35, 'Mezcla de especias de birria': 2, Agua: 100,
};
const cajita = { 'Papas para freír': 90, 'Aceite de fritura imputado': 6, Yogur: 80 };

const categorias = [
  {
    nombre: 'BX · Empanizados y alitas',
    productos: [
      ['01', 'Camarones empanizados con papas', 5, {
        ...papas, ...empanizado, 'Camarón limpio': 145, Aderezo: 25, Salsa: 20,
        'Sazonador de camarón': 2,
      }, 'Sazonador de prueba con sal, pimienta, ajo, cebolla, glutamato y colorante naranja, según formulación del proveedor.'],
      ['02', 'Deditos de pollo con papas', 6, {
        ...papas, ...empanizado, 'Pechuga de pollo': 150, Aderezo: 25, Salsa: 20,
        'Ajo en polvo': 1, 'Cebolla en polvo': 1, Pimienta: 0.5,
      }],
      ['10', 'Alitas a la barbacoa con papas', 14, {
        ...papas, 'Alitas de pollo con hueso': 280, 'Salsa barbacoa': 45, Aderezo: 25,
      }, 'Porción estimada de seis piezas, validar por peso.'],
      ['11', 'Alitas búfalo con papas', 15, {
        ...papas, 'Alitas de pollo con hueso': 280, 'Salsa búfalo': 45,
      }, 'Porción estimada de seis piezas, validar por peso.'],
      ['17', 'Pollo crunch con papas', 21, {
        ...papas, ...empanizado, 'Pechuga de pollo': 180, Aderezo: 25,
      }],
    ],
  },
  {
    nombre: 'BX · Hamburguesas y panes',
    productos: [
      ['03', 'Hamburguesa tradicional con papas', 7, {
        ...papas, ...panHamburguesa, 'Res molida': 150, 'Queso mozzarella': 25,
      }],
      ['04', 'Hamburguesa hawaiana con papas', 8, {
        ...papas, ...panHamburguesa, 'Res molida': 150, 'Queso mozzarella': 25, 'Piña enlatada escurrida': 45,
      }],
      ['05', 'Hamburguesa de pollo con papas', 9, {
        ...papas, ...panHamburguesa, ...empanizado, 'Pechuga de pollo': 145,
      }],
      ['06', 'Cangre búrguer con papas', 10, {
        ...papas, ...panHamburguesa, 'Res molida': 120, 'Camarón limpio': 70, Batter: 15, Panko: 12,
      }],
      ['07', 'Pan con carne Viuda con papas', 11, {
        ...papas, 'Pan chapata': 100, 'Res en tiras': 150, Chimichurri: 25,
        Lechuga: 15, 'Cebolla caramelizada': 25, Tomate: 35,
      }],
      ['08', 'Pan con chorizo argentino con papas', 12, {
        ...papas, 'Pan chapata': 90, 'Chorizo argentino': 125, Guacamole: 30,
        Escabeche: 25, Aguacate: 25, Chimichurri: 18,
      }, 'Se eligió escabeche como una de las alternativas del documento.'],
      ['09', 'Sándwich con cerdo', 13, {
        'Pan de sándwich': 80, 'Espaldilla de cerdo': 165, Guacamole: 35,
      }, 'Se estimó con espaldilla. La pierna es la alternativa del documento.'],
    ],
  },
  {
    nombre: 'BX · Tacos y para compartir',
    productos: [
      ['12', 'Tacos de birria', 16, { ...tacos, ...birria }, 'Tres tacos con consomé. Los gramajes de birria incluyen su proporción de consomé.'],
      ['13', 'Quesabirrias', 17, {
        ...tacos, ...birria, 'Queso mozzarella': 65,
      }, 'Tres quesabirrias con consomé.'],
      ['14', 'Tacos de camarón', 18, {
        ...tacos, 'Camarón limpio': 145, Batter: 24, Panko: 20,
        Repollo: 35, Aderezo: 25, 'Aceite de fritura imputado': 8,
      }, 'Tres tacos. Se estimó con camarón empanizado.'],
      ['15', 'Papas con carne', 19, {
        ...papas, 'Papas para freír': 220, 'Res molida': 130, 'Salsa de queso': 45, Salsa: 25,
      }],
      ['16', 'Nachos con carne', 20, {
        Totopos: 110, 'Res molida': 130, 'Salsa de queso': 55, Frijol: 50,
        Salsa: 30, Jalapeño: 12, Crema: 25,
      }],
    ],
  },
  {
    nombre: 'BX · Cajitas y combos',
    productos: [
      ['18-N', 'Cajita infantil de nuggets', 22, { ...cajita, 'Nuggets de pollo': 90 }, 'Agregar 1 bebida y 1 juguete según presentación.'],
      ['18-P', 'Cajita infantil de deditos', 22, {
        ...cajita, 'Pechuga de pollo': 90, Batter: 18, Panko: 15,
      }, 'Agregar 1 bebida y 1 juguete según presentación.'],
      ['18-C', 'Cajita infantil de camarones', 22, {
        ...cajita, 'Camarón limpio': 85, Batter: 18, Panko: 15,
      }, 'Agregar 1 bebida y 1 juguete según presentación.'],
      ['19', 'Combo cuates', 23, {}, 'Pendiente definir combinación y tamaño.'],
      ['20', 'Combo de amor', 24, {}, 'Pendiente definir combinación y tamaño.'],
      ['21', 'Combo familiar', 26, {}, 'Pendiente definir combinación y tamaño.'],
      ['22', 'Combo para picar', 27, {}, 'Pendiente definir combinación y tamaño.'],
    ],
  },
  {
    nombre: 'BX · Bebidas naturales',
    productos: [
      ['23', 'Jamaica', 28, { Agua: 325, 'Flor de jamaica seca': 6, Azúcar: 25 }, 'Vaso de 355 ml. Ajustar agua y hielo al medir el rendimiento final.'],
      ['24', 'Horchata', 28, {
        Agua: 300, 'Arroz seco': 28, Azúcar: 28, Canela: 1, Vainilla: 1,
      }, 'Vaso de 355 ml. Validar el rendimiento después de colar.'],
      ['25', 'Tamarindo', 28, { Agua: 305, 'Pulpa de tamarindo': 34, Azúcar: 25 }, 'Vaso de 355 ml. Validar el rendimiento después de colar.'],
    ],
  },
  {
    nombre: 'BX · Gaseosas y agua',
    productos: [
      ['26', 'Grapette lata', 29, {}, '1 lata. Confirmar presentación para configurar inventario.'],
      ['27', 'Seven lata', 29, {}, '1 lata. Confirmar presentación para configurar inventario.'],
      ['28', 'Mirinda lata', 29, {}, '1 lata. Confirmar presentación para configurar inventario.'],
      ['29', 'Coca-Cola lata', 29, {}, '1 lata. Confirmar presentación para configurar inventario.'],
      ['30', 'Pepsi lata', 29, {}, '1 lata. Confirmar presentación para configurar inventario.'],
      ['31', 'Agua pura PET 500 ml', 29, {}, '1 botella de 500 ml.'],
      ['32', 'Grapette PET 355 ml', 29, {}, '1 botella de 355 ml.'],
      ['33', 'Pepsi PET 355 ml', 29, {}, '1 botella de 355 ml.'],
    ],
  },
];

function nombreFotoMenuBase(numeroFoto) {
  return `00000000-0000-4000-8b00-${String(numeroFoto).padStart(12, '0')}.webp`;
}

module.exports = { categorias, nombreFotoMenuBase };
