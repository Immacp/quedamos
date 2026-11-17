import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../public/core.js';

const S = { v: 1, id: 'AAAAAAAAAAAAAAAAAAAAAA', key: new Uint8Array(32).fill(7), title: 'Cena', n: 3, startH: 9, endH: 22, startDate: '2026-11-16' };
const person = (pid, name, color, setter) => { const slots = C.emptySlots(S); setter(slots); return { pid, name, color, slots }; };
const on = (slots, day, ...hours) => hours.forEach((h) => C.setBit(slots, C.slotIndex(S, day, h), true));

test('fechas: suma, diferencia, día de la semana y meses', () => {
  assert.equal(C.addDays('2026-11-16', 30), '2026-12-16');
  assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(C.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(C.diffDays('2026-03-28', '2026-03-30'), 2); // cambio de hora en España
  assert.equal(C.weekdayMon('2026-11-16'), 0); // lunes
  assert.equal(C.weekdayMon('2026-11-22'), 6); // domingo
  assert.equal(C.weekdayMon('1970-01-01'), 3); // jueves
  assert.equal(C.formatDayShort('2026-11-20'), 'Vie 20 nov');
  assert.equal(C.formatDayLong('2026-11-19'), 'Jueves 19 de noviembre');
  assert.equal(C.todayStr(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.ok(C.isValidDateStr('2026-02-28'));
  assert.ok(!C.isValidDateStr('2026-02-30'));
  assert.equal(C.todayIndex(S, new Date(2026, 10, 18, 10)), 2);
});

test('slots: índices, bitmap y base64url ida y vuelta', () => {
  assert.equal(C.hoursOf(S), 13);
  assert.equal(C.slotCount(S), 390);
  assert.equal(C.slotBytes(S), 49);
  const b = C.emptySlots(S);
  C.setBit(b, C.slotIndex(S, 0, 9), true);
  C.setBit(b, C.slotIndex(S, 29, 21), true);
  assert.equal(C.slotIndex(S, 29, 21), 389);
  const back = C.slotsFromB64(S, C.slotsToB64(b));
  assert.deepEqual([...back], [...b]);
  assert.equal(C.countBits(back), 2);
  assert.throws(() => C.slotsFromB64(S, C.slotsToB64(new Uint8Array(10))));
  C.setDay(S, b, 3, true);
  assert.ok(C.dayHasAny(S, b, 3));
  assert.equal(C.countBits(b), 15);
  C.setDay(S, b, 3, false);
  assert.ok(!C.dayHasAny(S, b, 3));
});

test('semanas L-D: páginas', () => {
  // 16-11-2026 es lunes: 30 días = 4 semanas completas + 2 días (lun 14 y mar 15 dic)
  assert.equal(C.weekCount(S), 5);
  assert.equal(C.weekFirstDay(S, 0), 0);
  assert.equal(C.weekFirstDay(S, 4), 28);
  assert.equal(C.weekOfDay(S, 13), 1);
  assert.equal(C.weekOfDay(S, 99), 4);
  // empezando en jueves, la primera semana empieza 3 días antes del inicio
  const SJ = { ...S, startDate: '2026-11-19' };
  assert.equal(C.weekCount(SJ), 5);
  assert.equal(C.weekFirstDay(SJ, 0), -3);
  assert.equal(C.weekOfDay(SJ, 0), 0);
  assert.equal(C.weekOfDay(SJ, 4), 1); // lunes 23
});

test('enlace: codificar y decodificar (con y sin clave privada, con creador y enlaces v1 antiguos)', () => {
  const creator = 'cd'.repeat(32);
  const s = C.newSession({ title: 'Cumple de Lúa', n: 5, startDate: '2026-11-16', creator });
  const dec = C.decodeLink('#' + C.encodeLink(s));
  assert.equal(dec.session.title, 'Cumple de Lúa');
  assert.equal(dec.session.n, 5);
  assert.equal(dec.session.startH, 9);
  assert.equal(dec.session.endH, 22);
  assert.equal(dec.session.creator, creator);
  assert.deepEqual([...dec.session.key], [...s.key]);
  assert.equal(dec.priv, null);
  const priv = 'ab'.repeat(32);
  const withPriv = C.decodeLink(C.encodeLink(s, priv));
  assert.equal(withPriv.priv, priv);
  assert.equal(withPriv.session.creator, creator);
  // enlace v1 (sin creador), como los de la primera versión publicada: se sigue abriendo
  const v1 = C.bytesToB64u(C.utf8(JSON.stringify([1, s.id, C.bytesToB64u(s.key), 'Vieja', 4, 9, 22, '2026-11-16', priv])));
  const d1 = C.decodeLink(v1);
  assert.equal(d1.session.creator, null);
  assert.equal(d1.priv, priv);
  assert.equal(C.decodeLink(C.encodeLink(d1.session)).session.title, 'Vieja'); // y se vuelve a codificar como v1
  // v2 con creador inválido
  assert.equal(C.decodeLink(C.bytesToB64u(C.utf8(JSON.stringify([2, s.id, C.bytesToB64u(s.key), 'x', 4, 9, 22, '2026-11-16', 'zz'])))), null);
  assert.equal(C.decodeLink('#basura'), null);
  assert.equal(C.decodeLink(''), null);
  const bad = C.bytesToB64u(C.utf8(JSON.stringify([1, s.id, C.bytesToB64u(s.key), 'x', 25, 9, 22, '2026-11-16'])));
  assert.equal(C.decodeLink(bad), null); // más de 20 personas
});

test('colores: reparto de la casilla a partes iguales y mezcla para el brillo', () => {
  assert.equal(C.cellFill([]), null);
  assert.equal(C.cellFill(['red']), 'linear-gradient(var(--k-red), var(--k-red))');
  assert.equal(C.cellFill(['red', 'blue']), 'linear-gradient(90deg, var(--k-red) 0% 50%, var(--k-blue) 50% 100%)');
  assert.equal(C.cellFill(['green', 'blue', 'red']), 'linear-gradient(90deg, var(--k-green) 0% 33.333%, var(--k-blue) 33.333% 66.667%, var(--k-red) 66.667% 100%)');
  assert.ok(C.cellFill(['lila']).includes('--k-graphite')); // color desconocido: grafito
  const rgb = (m) => m.rgb.split(', ').map(Number);
  // rojo + azul = lila (azul y rojo altos, verde más bajo)
  const [r, g, b] = rgb(C.mixColors(['#ff3b30', '#007aff']));
  assert.ok(b === 255 && r > 190 && g < r && g < b, `lila: ${r},${g},${b}`);
  // amarillo + azul = verde
  const [r2, g2, b2] = rgb(C.mixColors(['#ffcc00', '#007aff']));
  assert.ok(g2 === 255 && r2 < g2 && b2 < g2, `verde: ${r2},${g2},${b2}`);
  // un solo color: el mismo, con toda la luz
  assert.equal(C.mixColors(['#ff3b30']).hex, '#ff3b30');
  assert.equal(C.mixColors(['nada']), null);
  assert.equal(C.mixColors(['#000000']).hex, '#ffffff');
  // brillo: mismo tono que la mezcla pero sin pasar de la luminosidad pedida (visible sobre fondo claro)
  const [gr, gg, gb] = C.glowRgb(['#ff3b30', '#007aff'], 0.6).split(', ').map(Number);
  assert.ok(gb > gr && gr > gg, `lila intenso: ${gr},${gg},${gb}`);
  assert.ok((Math.max(gr, gg, gb) + Math.min(gr, gg, gb)) / 2 / 255 <= 0.61);
  const pale = C.glowRgb(['#ff3b30', '#34c759', '#007aff'], 0.6).split(', ').map(Number);
  assert.ok((Math.max(...pale) + Math.min(...pale)) / 2 / 255 <= 0.61, `tres colores, visible: ${pale}`);
  assert.equal(C.glowRgb([]), null);
});

test('validación de nombres y payloads', () => {
  assert.equal(C.validateName('  Ana  ').value, 'Ana');
  assert.ok(!C.validateName('').ok);
  assert.ok(!C.validateName('x'.repeat(25)).ok);
  assert.ok(!C.validateName('ana', ['Ana']).ok);
  const ok = { v: 1, participantId: '0123456789abcdef', name: 'Ana', color: 'blue', slots: C.slotsToB64(C.emptySlots(S)), updatedAt: 1 };
  assert.ok(C.validatePayload(ok, S));
  assert.equal(C.validatePayload({ ...ok, color: 'lila' }, S), null);
  assert.equal(C.validatePayload({ ...ok, slots: 'AAAA' }, S), null);
  assert.equal(C.validatePayload({ ...ok, participantId: 'xyz' }, S), null);
});

test('fusión: gana el más nuevo; empate por created_at y luego id menor', () => {
  const e = (u, c, id) => ({ payload: { updatedAt: u }, event: { created_at: c, id } });
  assert.ok(C.isNewer(e(2, 1, 'b'), e(1, 5, 'a')));
  assert.ok(!C.isNewer(e(1, 9, 'a'), e(2, 1, 'b')));
  assert.ok(C.isNewer(e(1, 6, 'z'), e(1, 5, 'a')));
  assert.ok(C.isNewer(e(1, 5, 'a'), e(1, 5, 'b')));
  assert.ok(C.isNewer(e(1, 1, 'a'), undefined));
});

test('coincidencia total y mapa de calor', () => {
  const a = person('a', 'Ana', 'red', (s) => on(s, 4, 17, 18, 19));
  const b = person('b', 'Bea', 'blue', (s) => on(s, 4, 18, 19, 20));
  const c = person('c', 'Carlos', 'green', (s) => on(s, 4, 18));
  const people = [a, b, c];
  const counts = C.slotCounts(S, people);
  assert.equal(counts[C.slotIndex(S, 4, 18)], 3);
  assert.equal(counts[C.slotIndex(S, 4, 19)], 2);
  const req = C.requiredCount(S, people.length);
  assert.equal(req, 3);
  assert.ok(C.isFull(counts[C.slotIndex(S, 4, 18)], req));
  assert.ok(!C.isFull(counts[C.slotIndex(S, 4, 19)], req));
  assert.ok(C.weekHasFull(S, counts, req, 0));
  assert.ok(!C.weekHasFull(S, counts, req, 1));
  assert.ok(!C.weekHasFull(S, counts, req, 0, 5)); // desde el sábado ya no
  // si la sesión espera 5 personas y solo hay 3, no hay coincidencia total
  const S5 = { ...S, n: 5 };
  assert.ok(!C.isFull(3, C.requiredCount(S5, 3)));
  // si hay más conocidas que las indicadas, cuentan todas
  assert.equal(C.requiredCount(S, 4), 4);
  // con una sola persona no brilla
  assert.ok(!C.isFull(1, 1));
});

test('mejores bloques: orden por personas, duración y fecha; solo desde hoy', () => {
  const a = person('a', 'Ana', 'red', (s) => { on(s, 4, 17, 18, 19); on(s, 1, 10, 11, 12, 13); on(s, 0, 9, 10); });
  const b = person('b', 'Bea', 'blue', (s) => { on(s, 4, 17, 18, 19, 20); on(s, 1, 10, 11, 12, 13); on(s, 0, 9, 10); });
  const c = person('c', 'Carlos', 'green', (s) => { on(s, 4, 18, 19); on(s, 6, 12); });
  const best = C.bestBlocks(S, [a, b, c], { fromDay: 1 });
  assert.deepEqual(best.map((x) => [x.day, x.startH, x.endH, x.count]), [
    [4, 18, 20, 3], [1, 10, 14, 2], [4, 17, 18, 2],
  ]);
  assert.ok(best[0].full);
  assert.equal(C.formatBlock(best[0]), 'Vie 20 nov · 18:00–20:00 · 3/3');
  // hoy desde la hora actual
  const fromNoon = C.bestBlocks(S, [a, b, c], { fromDay: 1, fromHour: 12 });
  assert.deepEqual(fromNoon.find((x) => x.day === 1) && [fromNoon.find((x) => x.day === 1).startH], [12]);
  assert.ok(C.bestBlocks(S, [a, b, c], { fromDay: 0 }).some((x) => x.day === 0));
  assert.equal(C.bestBlocks(S, [a, b, c], { limit: 2 }).length, 2);
});
