import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/js/app.js', import.meta.url), 'utf8');

function functionBody(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Debe existir ${name}.`);
  const next = source.indexOf('\nfunction ', start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const responder = functionBody('respondInvitation');
const backgroundSettler = functionBody('scheduleRelatedPortfolioInvitationDecision');

assert.equal(
  responder.includes('relatedResults.push(await semillaP2P.respondToInvitation'),
  false,
  'Aceptar un panel no debe volver a bloquear la interfaz esperando invitaciones de proyecto legacy.'
);
assert.equal(
  responder.includes('scheduleRelatedPortfolioInvitationDecision(related, canonicalDecision)'),
  true,
  'Las invitaciones legacy relacionadas deben conservar su decisión en segundo plano.'
);
assert.equal(
  backgroundSettler.includes('queueMicrotask(async () =>'),
  true,
  'La compatibilidad legacy debe ejecutarse fuera de la ruta crítica de aceptación.'
);
assert.equal(
  backgroundSettler.includes('state.portfolioInviteSettlementCount += 1'),
  true,
  'La reparación legacy debe cercar el auto-accept sin reutilizar el indicador de una aceptación automática ya en curso.'
);
assert.equal(
  backgroundSettler.includes("await semillaP2P.respondToInvitation(invitation.invitationId, canonicalDecision)"),
  true,
  'El segundo plano debe conservar tanto aceptar como rechazar para proyectos legacy relacionados.'
);
assert.equal(
  backgroundSettler.includes('state.portfolioInviteSettlementCount = Math.max(0, state.portfolioInviteSettlementCount - 1)'),
  true,
  'El cerco concurrente debe liberarse incluso después de completar o fallar la reparación legacy.'
);
assert.equal(
  source.includes('state.portfolioInviteAccepting || state.portfolioInviteSettlementCount > 0'),
  true,
  'El auto-accept debe quedar suspendido mientras exista cualquier reparación legacy en segundo plano.'
);
assert.equal(
  backgroundSettler.includes('autoAcceptInheritedPortfolioInvitations().catch(() => false)'),
  true,
  'Tras la reparación debe reanudarse la convergencia automática de cualquier herencia pendiente.'
);

console.log('OK: aceptar/rechazar un panel responde de inmediato y resuelve invitaciones de proyecto legacy en segundo plano sin duplicar el auto-accept.');
