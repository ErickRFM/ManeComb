const fs = require('node:fs');

const file = 'scripts/phase1-account-channel-codemod.cjs';
let source = fs.readFileSync(file, 'utf8');

const replacements = [
  [
    '      message: `Cuenta company_owner con plan activo no obtuvo acceso movil (${authContext?.mobileBlockReason || "sin razon"}).`',
    '      message: "Cuenta company_owner con plan activo no obtuvo acceso movil (" + (authContext?.mobileBlockReason || "sin razon") + ")."'
  ],
  [
    '      message: `Cuenta company_owner con plan activo no obtuvo acceso operativo (${authContext?.operationalBlockReason || "sin razon"}).`',
    '      message: "Cuenta company_owner con plan activo no obtuvo acceso operativo (" + (authContext?.operationalBlockReason || "sin razon") + ")."'
  ]
];

for (const [before, after] of replacements) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`Se esperaba exactamente una coincidencia y se encontraron ${count}: ${before}`);
  }
  source = source.replace(before, after);
}

fs.writeFileSync(file, source, 'utf8');
console.log('Codemod syntax repaired in workflow workspace.');
