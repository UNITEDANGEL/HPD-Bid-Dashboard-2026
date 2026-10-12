const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const load = (file, deps = {}) => {
  const source = ts.transpileModule(fs.readFileSync(require.resolve(file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'module', 'require', source)(mod.exports, mod, (name) => deps[name]);
  return mod.exports;
};
const location = load('../lib/jobLocation.ts');
const { cleanTenantContactName: name, cleanTenantPhone: phone, tenantContactInfo } = load('../lib/tenantContact.ts', { './jobLocation': location });

// Names: page text glued on by ITB extraction is cut off; placeholders and run-on junk are dropped.
assert.equal(name('ROSA FITZGERALDERPREPAIRSOPFALMRTPTFWSIFBFGCSIIQ'), 'ROSA FITZGERALD');
assert.equal(name('WANDA MCKINNONAEPROUNDMPFALMRTPT'), 'WANDA MCKINNON');
assert.equal(name('MAXENGELAEPROUND'), 'MAXENGEL');
assert.equal(name('AEPROUNDPFALMRTPTFWSIFBFGCSIIQAWCWSIRSCNEODGSFNYNY'), '');
assert.equal(name('LATOYA HARRIS'), 'LATOYA HARRIS');
assert.equal(name('John Doe'), '');
assert.equal(name('T'), '');
assert.equal(name('X'.repeat(45)), '');

// Phones: formatted when they can be a US number, dropped when they can't (area code 0/1).
assert.equal(phone('(212) 863-6959'), '(212) 863-6959');
assert.equal(phone('2024140669'), '(202) 414-0669');
assert.equal(phone('1-929-638-4274'), '(929) 638-4274');
assert.equal(phone('109 551 0156'), '');
assert.equal(phone('212 155 0100'), '');
assert.equal(phone(''), '');

// The shared tenant contact used by paperwork gets the same cleaning.
const info = tenantContactInfo({ ItbTenantName: 'SANDRA YOUNGERPREPAIRSCPFALMRT', ItbTenantPhone: '117 551 0442', ItbTenantApartment: '(718)989-1382FAX:PROCUREMENTSPECIALIST:', ItbPage3Description: 'BATHROOM LEAK' });
assert.equal(info.name, 'SANDRA YOUNG');
assert.equal(info.phone, '');
assert.ok(!/FAX|PROCUREMENT/i.test(String(info.apartment)));

console.log('tenant contact cleaning tests passed');
